-- Atomic checkout. Only the Netlify service-role client may call these functions.
create table if not exists public.pedido_envios (
  request_id uuid primary key,
  fingerprint text not null,
  respuesta jsonb not null,
  creado_en timestamptz not null default now()
);
alter table public.pedido_envios enable row level security;
revoke all on public.pedido_envios from public, anon, authenticated;
grant select, insert on public.pedido_envios to service_role;
create index if not exists pedido_envios_fingerprint_idx on public.pedido_envios(fingerprint, creado_en desc);

-- Transactional counter: failed checkouts and retries do not consume folios.
create table if not exists public.pedido_folio_contador (
  id boolean primary key default true check (id),
  ultimo bigint not null default 0 check (ultimo >= 0)
);
alter table public.pedido_folio_contador enable row level security;
revoke all on public.pedido_folio_contador from public, anon, authenticated;
grant select, update on public.pedido_folio_contador to service_role;
insert into public.pedido_folio_contador(id,ultimo)
  select true,coalesce(max(folio::bigint),0) from public.pedidos where folio ~ '^[0-9]+$'
  on conflict (id) do nothing;

create or replace function public.pedido_normalize(value text)
returns text language sql immutable strict security invoker set search_path = ''
as $$ select lower(regexp_replace(regexp_replace(normalize(btrim(value), NFD), U&'[\0300-\036f]', '', 'g'), '\s+', ' ', 'g')) $$;
revoke all on function public.pedido_normalize(text) from public, anon, authenticated;
grant execute on function public.pedido_normalize(text) to service_role;

create or replace function public.crear_pedido_catalogo(p_cliente text, p_items jsonb, p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
<<checkout>>
declare
  customer text := regexp_replace(btrim(p_cliente), '\s+', ' ', 'g');
  line jsonb;
  lines jsonb;
  canonical jsonb := '[]'::jsonb;
  fingerprint text;
  existing public.pedido_envios%rowtype;
  saved public.pedidos%rowtype;
  variant record;
  matches integer;
  qty numeric;
  total numeric := 0;
  result jsonb;
  folio_numero bigint;
begin
  if p_request_id is null or customer is null or length(customer) not between 1 and 120 then
    raise exception using errcode='P0001', message='Nombre de cliente inválido.';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception using errcode='P0001', message='Pedido inválido.';
  end if;
  if jsonb_array_length(p_items) not between 1 and 500 then
    raise exception using errcode='P0001', message='El pedido debe contener entre 1 y 500 productos.';
  end if;
  for line in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(line->'modelo') is distinct from 'string'
       or jsonb_typeof(line->'color') is distinct from 'string'
       or length(btrim(line->>'modelo')) not between 1 and 80
       or length(btrim(line->>'color')) not between 1 and 80
       or jsonb_typeof(line->'cantidad') is distinct from 'number' then
      raise exception using errcode='P0001', message='Hay productos inválidos en el pedido.';
    end if;
    qty := (line->>'cantidad')::numeric;
    if qty < 6 or qty > 2147483646 or mod(qty,6) <> 0 then
      raise exception using errcode='P0001', message='Las cantidades deben ser múltiplos de 6.';
    end if;
  end loop;
  select jsonb_agg(jsonb_build_object('modelo', modelo, 'color', color, 'cantidad', cantidad) order by modelo, color)
    into lines from (
      select public.pedido_normalize(value->>'modelo') modelo,
             public.pedido_normalize(value->>'color') color,
             sum((value->>'cantidad')::numeric) cantidad
      from jsonb_array_elements(p_items) group by 1,2
    ) grouped;
  fingerprint := encode(sha256(convert_to(jsonb_build_object('cliente',public.pedido_normalize(customer),'items',lines)::text,'UTF8')),'hex');
  -- Serialize retries and simultaneous submissions before looking up their result.
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select * into existing from public.pedido_envios where request_id=p_request_id;
  if found then
    if existing.fingerprint <> fingerprint then
      raise exception using errcode='P0001', message='Este intento pertenece a otro pedido. Vuelve a intentarlo.';
    end if;
    return existing.respuesta;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(fingerprint, 1));
  select * into existing from public.pedido_envios
    where pedido_envios.fingerprint=checkout.fingerprint
      and creado_en > now()-interval '30 minutes'
    order by creado_en desc limit 1;
  if found then
    insert into public.pedido_envios(request_id,fingerprint,respuesta,creado_en)
      values(p_request_id,fingerprint,existing.respuesta,existing.creado_en);
    return existing.respuesta;
  end if;
  for line in select value from jsonb_array_elements(lines) loop
    qty := (line->>'cantidad')::numeric;
    select count(*) into matches from public.modelos m join public.variantes v on v.modelo_id=m.id
      where m.activo and v.activo and public.pedido_normalize(m.modelo)=line->>'modelo'
        and public.pedido_normalize(v.color)=line->>'color';
    if matches <> 1 then
      raise exception using errcode='P0001', message=format('Modelo %s · %s: no disponible o identificación ambigua.',line->>'modelo',line->>'color');
    end if;
    select m.modelo, v.color, i.existencia into variant
      from public.modelos m join public.variantes v on v.modelo_id=m.id
      join public.inventario_mayoreo i on i.variante_id=v.id
      where m.activo and v.activo and public.pedido_normalize(m.modelo)=line->>'modelo'
        and public.pedido_normalize(v.color)=line->>'color'
      for share of m,v,i;
    if not found then
      raise exception using errcode='P0001', message=format('Modelo %s · %s: sin existencias.',line->>'modelo',line->>'color');
    end if;
    if variant.existencia is null or variant.existencia < qty then
      raise exception using errcode='P0001', message=format('Modelo %s · %s: pediste %s pares y quedan %s.',variant.modelo,variant.color,qty,coalesce(variant.existencia,0));
    end if;
    total := total+qty;
    if total > 2147483646 then
      raise exception using errcode='P0001', message='Cantidad total inválida.';
    end if;
    canonical := canonical || jsonb_build_array(jsonb_build_object('modelo',variant.modelo,'color',variant.color,'cantidad',qty));
  end loop;
  update public.pedido_folio_contador set ultimo=ultimo+1 where id=true
    returning ultimo into folio_numero;
  if folio_numero is null then raise exception 'No está configurado el contador de folios'; end if;
  insert into public.pedidos(folio,cliente,total_pares,estado)
    values(lpad(folio_numero::text,greatest(4,length(folio_numero::text)),'0'),customer,total::integer,'Nuevo')
    returning * into saved;
  insert into public.pedido_detalles(pedido_id,modelo,color,cantidad)
    select saved.id,value->>'modelo',value->>'color',(value->>'cantidad')::integer
    from jsonb_array_elements(canonical);
  result := jsonb_build_object('id',saved.id,'folio',saved.folio,'cliente',saved.cliente,'total_pares',saved.total_pares,'estado',saved.estado,'creado_en',saved.creado_en,'items',canonical);
  insert into public.pedido_envios(request_id,fingerprint,respuesta) values(p_request_id,fingerprint,result);
  return result;
end;
$$;
revoke all on function public.crear_pedido_catalogo(text,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.crear_pedido_catalogo(text,jsonb,uuid) to service_role;
notify pgrst, 'reload schema';
