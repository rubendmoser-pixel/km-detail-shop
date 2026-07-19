import { getStorageStatus } from "./storage-status-service.js";

const CLOSED_STATUSES = new Set(["delivered", "cancelled"]);
const OPEN_PAYMENT_STATUSES = new Set(["pending_payment", "receipt_uploaded", "credit_account", "overdue", "rejected"]);

export function getAdminOperationDashboard(db) {
  const orders = db.prepare(`
    SELECT o.id, o.order_number, o.status, o.payment_status, o.fulfillment_status,
           o.total_cents, o.paid_cents, o.balance_cents, o.payment_due_date,
           o.sales_rep_name, o.sales_rep_email, o.sales_commission_cents,
           o.created_at, c.business_name, c.tax_id
    FROM orders o
    JOIN customers c ON c.id = o.customer_id
    ORDER BY o.created_at DESC
  `).all();

  const items = db.prepare(`
    SELECT oi.order_id, oi.km_code, oi.product_name, oi.quantity, oi.confirmed_quantity,
           oi.subtotal_net_cents, oi.confirmed_subtotal_net_cents
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.status <> 'cancelled'
  `).all();

  const accountPayments = listCurrentAccountPayments(db);
  const accountPaymentsByOrder = groupAccountPayments(accountPayments);

  const now = new Date();
  const today = isoDate(now);
  const monthStart = `${today.slice(0, 7)}-01`;
  const closedOrders = orders.filter((order) => !CLOSED_STATUSES.has(order.status));
  const activeOrders = orders.filter((order) => !CLOSED_STATUSES.has(order.status) && order.fulfillment_status !== "delivered");
  const finalizedOrders = orders.filter((order) => order.status === "delivered" || order.fulfillment_status === "delivered");
  const monthOrders = orders.filter((order) => (order.created_at || "").slice(0, 10) >= monthStart && order.status !== "cancelled");
  const openBalanceOrders = orders
    .filter((order) => Number(order.balance_cents || 0) > 0 && OPEN_PAYMENT_STATUSES.has(order.payment_status))
    .sort(compareCurrentAccountOrders);
  const overdueOrders = openBalanceOrders.filter((order) => order.payment_due_date && order.payment_due_date < today);
  const dueSoonOrders = openBalanceOrders.filter((order) => order.payment_due_date && order.payment_due_date >= today && order.payment_due_date <= addDaysIsoDate(now, 2));

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalOrders: orders.length,
      activeOrders: activeOrders.length,
      finalizedOrders: finalizedOrders.length,
      monthTotalCents: sum(monthOrders, "total_cents"),
      monthPaidCents: sum(monthOrders, "paid_cents"),
      openBalanceCents: sum(openBalanceOrders, "balance_cents"),
      overdueBalanceCents: sum(overdueOrders, "balance_cents"),
      dueSoonBalanceCents: sum(dueSoonOrders, "balance_cents"),
      pendingReceipts: orders.filter((order) => order.payment_status === "receipt_uploaded").length,
      pendingDispatch: orders.filter((order) => order.fulfillment_status === "ready").length
    },
    sales: {
      byDay: groupOrdersByDay(monthOrders),
      byCustomer: groupByCustomer(monthOrders),
      bySalesRep: groupBySalesRep(monthOrders)
    },
    currentAccounts: {
      open: openBalanceOrders.map((order) => mapCurrentAccountOrder(order, accountPaymentsByOrder)),
      overdue: overdueOrders.map((order) => mapCurrentAccountOrder(order, accountPaymentsByOrder)),
      dueSoon: dueSoonOrders.map((order) => mapCurrentAccountOrder(order, accountPaymentsByOrder))
    },
    products: topProducts(items),
    queues: buildQueues(orders),
    storage: getStorageStatus()
  };
}

function buildQueues(orders) {
  return {
    received: orders.filter((order) => order.status === "order_created").length,
    receipts: orders.filter((order) => order.payment_status === "receipt_uploaded").length,
    collection: orders.filter((order) => OPEN_PAYMENT_STATUSES.has(order.payment_status) && order.status !== "order_created").length,
    preparation: orders.filter((order) => ["paid", "credit_account", "settled_adjustment"].includes(order.payment_status) && ["availability_confirmed", "confirmed", "in_preparation", "ready"].includes(order.status) && order.fulfillment_status === "pending").length,
    dispatch: orders.filter((order) => order.fulfillment_status === "ready").length,
    transit: orders.filter((order) => order.fulfillment_status === "shipped").length
  };
}

function groupOrdersByDay(orders) {
  const byDay = new Map();
  for (const order of orders) {
    const day = (order.created_at || "").slice(0, 10) || "Sin fecha";
    const entry = byDay.get(day) || { day, orders: 0, totalCents: 0, paidCents: 0, balanceCents: 0 };
    entry.orders += 1;
    entry.totalCents += Number(order.total_cents || 0);
    entry.paidCents += Number(order.paid_cents || 0);
    entry.balanceCents += Number(order.balance_cents || 0);
    byDay.set(day, entry);
  }
  return [...byDay.values()].sort((a, b) => b.day.localeCompare(a.day)).slice(0, 31);
}

function groupByCustomer(orders) {
  const byCustomer = new Map();
  for (const order of orders) {
    const key = order.tax_id || order.business_name || "Sin cliente";
    const entry = byCustomer.get(key) || {
      businessName: order.business_name || "Sin cliente",
      taxId: order.tax_id || "",
      orders: 0,
      totalCents: 0,
      paidCents: 0,
      balanceCents: 0
    };
    entry.orders += 1;
    entry.totalCents += Number(order.total_cents || 0);
    entry.paidCents += Number(order.paid_cents || 0);
    entry.balanceCents += Number(order.balance_cents || 0);
    byCustomer.set(key, entry);
  }
  return [...byCustomer.values()].sort((a, b) => b.totalCents - a.totalCents).slice(0, 12);
}

function groupBySalesRep(orders) {
  const byRep = new Map();
  for (const order of orders) {
    const key = order.sales_rep_email || "sin-vendedor";
    const entry = byRep.get(key) || {
      name: order.sales_rep_name || "Sin vendedor",
      email: order.sales_rep_email || "",
      orders: 0,
      totalCents: 0,
      commissionCents: 0
    };
    entry.orders += 1;
    entry.totalCents += Number(order.total_cents || 0);
    entry.commissionCents += Number(order.sales_commission_cents || 0);
    byRep.set(key, entry);
  }
  return [...byRep.values()].sort((a, b) => b.totalCents - a.totalCents).slice(0, 12);
}

function topProducts(items) {
  const byProduct = new Map();
  for (const item of items) {
    const key = item.km_code;
    const confirmedQuantity = Number(item.confirmed_quantity || 0);
    const quantity = confirmedQuantity > 0 ? confirmedQuantity : Number(item.quantity || 0);
    const subtotalCents = Number(item.confirmed_subtotal_net_cents || item.subtotal_net_cents || 0);
    const entry = byProduct.get(key) || { kmCode: item.km_code, productName: item.product_name, quantity: 0, subtotalCents: 0 };
    entry.quantity += quantity;
    entry.subtotalCents += subtotalCents;
    byProduct.set(key, entry);
  }
  return [...byProduct.values()].sort((a, b) => b.subtotalCents - a.subtotalCents).slice(0, 15);
}

function mapCurrentAccountOrder(order, accountPaymentsByOrder = new Map()) {
  const today = isoDate(new Date());
  const paidCents = Number(order.paid_cents || 0);
  const accountPayments = [...(accountPaymentsByOrder.get(Number(order.id)) || [])];
  const detailedPaidCents = accountPayments.reduce((total, payment) => total + Number(payment.amountCents || 0), 0);
  if (paidCents > detailedPaidCents) {
    accountPayments.push({
      id: `previous-${order.id}`,
      amountCents: paidCents - detailedPaidCents,
      method: "previous_credit",
      reference: "",
      note: "Acreditación anterior sin detalle individual",
      createdAt: ""
    });
  }
  return {
    id: order.id,
    orderNumber: order.order_number,
    businessName: order.business_name,
    salesRepName: order.sales_rep_name || "",
    salesRepEmail: order.sales_rep_email || "",
    paymentStatus: order.payment_status,
    totalCents: Number(order.total_cents || 0),
    paidCents,
    balanceCents: Number(order.balance_cents || 0),
    dueDate: order.payment_due_date || "",
    daysToDue: order.payment_due_date ? daysBetween(today, order.payment_due_date) : null,
    createdAt: order.created_at,
    accountPayments
  };
}

function listCurrentAccountPayments(db) {
  const payments = [];
  if (tableExists(db, "account_payments")) {
    payments.push(...db.prepare(`
      SELECT id, order_id, amount_cents, method, reference, note, created_at
      FROM account_payments
    `).all().map((payment) => ({ ...payment, id: `account-${payment.id}` })));
  }
  if (tableExists(db, "payment_receipts")) {
    payments.push(...db.prepare(`
      SELECT id, order_id, amount_cents, original_filename, review_reason,
             COALESCE(reviewed_at, created_at) AS payment_date
      FROM payment_receipts
      WHERE status = 'accepted' AND amount_cents > 0
    `).all().map((payment) => ({
      id: `receipt-${payment.id}`,
      order_id: payment.order_id,
      amount_cents: payment.amount_cents,
      method: "approved_receipt",
      reference: payment.original_filename || "",
      note: payment.review_reason || "Comprobante aprobado",
      created_at: payment.payment_date || ""
    })));
  }
  if (tableExists(db, "mercadopago_payments")) {
    payments.push(...db.prepare(`
      SELECT id, order_id, amount_cents, payment_id, status_detail, updated_at, created_at
      FROM mercadopago_payments
      WHERE status = 'approved' AND amount_cents > 0
    `).all().map((payment) => ({
      id: `mercadopago-${payment.id}`,
      order_id: payment.order_id,
      amount_cents: payment.amount_cents,
      method: "mercadopago",
      reference: payment.payment_id || "",
      note: payment.status_detail || "Pago acreditado automáticamente",
      created_at: payment.updated_at || payment.created_at || ""
    })));
  }
  return payments.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
}

function tableExists(db, table) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
}

function groupAccountPayments(payments) {
  const byOrder = new Map();
  for (const payment of payments) {
    const orderId = Number(payment.order_id);
    const entries = byOrder.get(orderId) || [];
    entries.push({
      id: payment.id,
      amountCents: Number(payment.amount_cents || 0),
      method: payment.method || "",
      reference: payment.reference || "",
      note: payment.note || "",
      createdAt: payment.created_at || ""
    });
    byOrder.set(orderId, entries);
  }
  return byOrder;
}

function compareCurrentAccountOrders(a, b) {
  const aDate = a.payment_due_date || "9999-12-31";
  const bDate = b.payment_due_date || "9999-12-31";
  if (aDate !== bDate) return aDate.localeCompare(bDate);
  return Number(b.balance_cents || 0) - Number(a.balance_cents || 0);
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + Number(row[key] || 0), 0);
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDaysIsoDate(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return isoDate(next);
}

function daysBetween(fromIso, toIso) {
  const from = new Date(`${fromIso}T00:00:00Z`);
  const to = new Date(`${toIso}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}
