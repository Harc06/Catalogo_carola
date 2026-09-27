-- Run after database/pedido_checkout.sql, inside BEGIN ... ROLLBACK.
create function pg_temp.reject_audit_detail() returns trigger language plpgsql as $$
begin
  if exists(select 1 from public.pedidos where id=new.pedido_id and cliente='__checkout_atomic_failure__') then
    raise exception 'simulated detail failure';
  end if;
  return new;
end $$;
create trigger checkout_audit_failure before insert on public.pedido_detalles for each row execute function pg_temp.reject_audit_detail();
set local role service_role;
do $$
declare
  item jsonb;
  a jsonb;
  b jsonb;
  request uuid:=gen_random_uuid();
  before_count bigint;
  failed boolean;
  stock integer;
  initial_folio bigint;
begin
  select jsonb_build_object('modelo',m.modelo,'color',v.color,'cantidad',6),i.existencia into item,stock
    from public.modelos m join public.variantes v on v.modelo_id=m.id
    join public.inventario_mayoreo i on i.variante_id=v.id
    where m.activo and v.activo and i.existencia>=6
    and (select count(*) from public.modelos m2 join public.variantes v2 on v2.modelo_id=m2.id where m2.activo and v2.activo and public.pedido_normalize(m2.modelo)=public.pedido_normalize(m.modelo) and public.pedido_normalize(v2.color)=public.pedido_normalize(v.color))=1
    limit 1;
  assert item is not null, 'Requires an available variant';
  select ultimo into initial_folio from public.pedido_folio_contador where id=true;
  a:=public.crear_pedido_catalogo('__checkout_audit__',jsonb_build_array(item),request);
  b:=public.crear_pedido_catalogo('__checkout_audit__',jsonb_build_array(item),request);
  assert (a->>'folio')=lpad((initial_folio+1)::text,greatest(4,length((initial_folio+1)::text)),'0'),'Wrong sequential folio';
  assert a=b, 'Retry must return the exact saved result';
  b:=public.crear_pedido_catalogo('__checkout_audit__',jsonb_build_array(item),gen_random_uuid());
  assert a=b, 'Concurrent-equivalent request must reuse the same result';
  assert (select count(*) from public.pedido_detalles where pedido_id=(a->>'id')::bigint)=1,'Details missing';
  assert (a->>'total_pares')::integer=6,'Wrong total';
  select count(*) into before_count from public.pedidos;
  failed:=false;
  begin
    perform public.crear_pedido_catalogo('__checkout_audit__',jsonb_build_array(item||'{"cantidad":12}'::jsonb),request);
  exception when sqlstate 'P0001' then failed:=true; end;
  assert failed,'Reusing key with different content must fail';
  failed:=false;
  begin
    perform public.crear_pedido_catalogo('__checkout_atomic_failure__',jsonb_build_array(item),gen_random_uuid());
  exception when sqlstate 'P0001' then failed:=true; end;
  assert failed,'Simulated detail failure must propagate';
  assert (select count(*) from public.pedidos)=before_count,'Header must roll back';
  assert (select ultimo from public.pedido_folio_contador where id=true)=initial_folio+1,'Failure/retry must not consume folios';
  b:=public.crear_pedido_catalogo('__checkout_second__',jsonb_build_array(item),gen_random_uuid());
  assert (b->>'folio')::bigint=(a->>'folio')::bigint+1,'Next order must be consecutive';
  failed:=false;
  begin
    perform public.crear_pedido_catalogo('__checkout_invalid__',jsonb_build_array(item||'{"cantidad":7}'::jsonb),gen_random_uuid());
  exception when sqlstate 'P0001' then failed:=true; end;
  assert failed,'Non-multiple must fail';
  failed:=false;
  begin
    -- Each line fits separately; their sum exceeds the stock.
    perform public.crear_pedido_catalogo('__checkout_overstock__',jsonb_build_array(item||jsonb_build_object('cantidad',(stock/6)*6),item||jsonb_build_object('cantidad',(stock/6)*6)),gen_random_uuid());
  exception when sqlstate 'P0001' then failed:=true; end;
  assert failed,'Grouped quantities must be checked against stock';
  failed:=false;
  begin
    perform public.crear_pedido_catalogo('__checkout_missing__','[{"modelo":"__missing__","color":"negro","cantidad":6}]',gen_random_uuid());
  exception when sqlstate 'P0001' then failed:=true; end;
  assert failed,'Missing model must fail';
end $$;
reset role;
