const fs=require("fs");
const assert=require("assert");

const pedidos=fs.readFileSync("netlify/functions/admin-pedidos.js","utf8");
const admin=fs.readFileSync("admin-core.js","utf8");

assert(pedidos.includes('supabase.rpc("enviar_pedido_atomico"'),"Shipping must use atomic RPC");
assert(pedidos.includes('supabase.rpc("eliminar_pedido_atomico"'),"Deletion must use atomic reversal RPC");
assert(!admin.includes('action:"remove-order-sale"'),"Frontend must not manually reverse finance");
assert(!admin.includes('action:"add-order-sale"'),"Frontend must not manually add shipped-order finance");
assert(admin.includes('forma_pago:paymentMethod')&&admin.includes('cliente_id:Number(debt.id)'),"Shipping must pass payment method and client ID");
assert(admin.includes('loadOrders(),loadModels(),loadClients(),loadFinance()'),"Atomic deletion must refresh all affected modules");

console.log("✓ Integrity checks passed");
