import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { NavLink, Routes, Route, Navigate } from 'react-router-dom';
import {
  Activity, AlertTriangle, BarChart3, Building2, CheckCircle2, CircleDollarSign,
  ClipboardList, Database, FileCheck2, FileText, Gauge, LayoutDashboard, Plus,
  RefreshCw, ShieldCheck, Sparkles, Users, Wallet, XCircle
} from 'lucide-react';
import { getJson, postJson } from './api';

type Role = 'SUPPLIER' | 'BUYER' | 'FINANCE' | 'ADMIN';
type Invoice = { invoiceId: string; supplierId: string; buyerId: string; invoiceNumber: string; currency: string; amount: number; status: string; dueDate: string; issueDate?: string; createdAt?: string };
type Party = { partyId: string; partyType: string; legalName: string; email: string; countryCode: string; status: string };
type EventItem = { eventId: string; eventType: string; aggregateId: string; occurredAt: string; producer?: string };
type Summary = { eventCount: number; invoiceCreated: number; invoiceAccepted: number; riskCompleted: number; financingApproved: number; paymentsDisbursed: number; reconciliationsCompleted: number; recentEvents: EventItem[] };
type SparkSummary = { service: string; language: string; engine: string; running: boolean; totalEvents: number; lastBatchId: number; byEventType: Record<string, number>; sparkUiUrl: string; startedAt?: string };

const money = (v: number, c = 'INR') => new Intl.NumberFormat('en-IN', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(Number(v || 0));
const pick = (row: any, ...keys: string[]) => { for (const k of keys) if (row && row[k] !== undefined && row[k] !== null) return row[k]; return ''; };
const roleInfo: Record<Role, { label: string; id: string; description: string }> = {
  SUPPLIER: { label: 'Aarav Supplier', id: 'SUP-001', description: 'Create receivables and track financing progress.' },
  BUYER: { label: 'Northstar Buyer', id: 'BUY-001', description: 'Review submitted invoices and confirm or reject obligations.' },
  FINANCE: { label: 'Finance Operator', id: 'finance', description: 'Review risk, financing, payment and reconciliation operations.' },
  ADMIN: { label: 'Platform Admin', id: 'admin', description: 'Manage demo parties, run synthetic scenarios and monitor platform services.' }
};

function Metric({ label, value, note, icon: Icon }: { label: string; value: ReactNode; note?: string; icon?: any }) {
  return <article className="metric-card"><div className="metric-head"><small>{label}</small>{Icon && <Icon size={17} />}</div><strong>{value}</strong>{note && <em>{note}</em>}</article>;
}
function Page({ title, subtitle, notice, children, right }: { title: string; subtitle?: string; notice?: string; children: ReactNode; right?: ReactNode }) {
  return <section><div className="page-head"><div><p className="eyebrow">INVOICEFLOW WORKSPACE</p><h1>{title}</h1>{subtitle && <p className="muted page-subtitle">{subtitle}</p>}</div>{right}</div>{notice && <div className="notice">{notice}</div>}{children}</section>;
}
function Empty({ children }: { children: ReactNode }) { return <div className="empty-state">{children}</div>; }
function TableFrame({ children }: { children: ReactNode }) { return <div className="table-wrap"><table>{children}</table></div>; }

function App() {
  const [role, setRole] = useState<Role>('SUPPLIER');
  const [refresh, setRefresh] = useState(0);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [risks, setRisks] = useState<any[]>([]);
  const [financing, setFinancing] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [reconciliations, setReconciliations] = useState<any[]>([]);
  const [spark, setSpark] = useState<SparkSummary | null>(null);
  const [sparkEvents, setSparkEvents] = useState<any[]>([]);
  const [formSupplier, setFormSupplier] = useState('SUP-001');
  const [formBuyer, setFormBuyer] = useState('BUY-001');
  const [formInvoiceNumber, setFormInvoiceNumber] = useState(`INV-${Date.now().toString().slice(-7)}`);
  const [formAmount, setFormAmount] = useState('125000');
  const [formDue, setFormDue] = useState('2026-12-20');
  const [partyType, setPartyType] = useState('SUPPLIER');
  const [partyName, setPartyName] = useState('');
  const [partyEmail, setPartyEmail] = useState('');
  const [generationCount, setGenerationCount] = useState('8');
  const [generationResult, setGenerationResult] = useState<any>(null);

  const reload = () => { setRefresh(v => v + 1); setNotice('Refreshing service data…'); };
  useEffect(() => {
    let active = true;
    const load = async () => {
      const requests = await Promise.allSettled([
        getJson<Invoice[]>('/invoices'), getJson<Party[]>('/parties'), getJson<Summary>('/dashboard/summary'),
        getJson<any[]>('/risk'), getJson<any[]>('/financing'), getJson<any[]>('/payments'),
        getJson<any[]>('/reconciliations'), getJson<SparkSummary>('/spark/analytics/summary'), getJson<any[]>('/spark/analytics/events')
      ]);
      if (!active) return;
      const setters = [setInvoices, setParties, setSummary, setRisks, setFinancing, setPayments, setReconciliations, setSpark, setSparkEvents];
      requests.forEach((r, i) => { if (r.status === 'fulfilled') (setters[i] as (v: any) => void)(r.value); });
    };
    load();
    const timer = window.setInterval(load, 10000);
    return () => { active = false; window.clearInterval(timer); };
  }, [refresh]);

  const act = async (fn: () => Promise<any>, success: string) => {
    setBusy(true); setNotice('');
    try { const result = await fn(); setNotice(success); setRefresh(v => v + 1); return result; }
    catch (e) { setNotice(e instanceof Error ? e.message : 'Action failed'); return undefined; }
    finally { setBusy(false); }
  };

  const visibleInvoices = useMemo(() => {
    if (role === 'SUPPLIER') return invoices.filter(x => x.supplierId === roleInfo.SUPPLIER.id);
    if (role === 'BUYER') return invoices.filter(x => x.buyerId === roleInfo.BUYER.id);
    return invoices;
  }, [invoices, role]);
  const buyerPending = visibleInvoices.filter(x => x.status === 'SUBMITTED');
  const supplierFinancing = financing.filter(x => pick(x, 'supplier_id', 'SUPPLIER_ID', 'supplierId') === roleInfo.SUPPLIER.id);
  const approvedAmount = financing.reduce((sum, x) => sum + Number(pick(x, 'approved_amount', 'APPROVED_AMOUNT', 'approvedAmount') || 0), 0);

  const navByRole: Record<Role, { to: string; label: string; icon: any }[]> = {
    SUPPLIER: [
      { to: '/', label: 'Overview', icon: LayoutDashboard }, { to: '/invoices', label: 'My invoices', icon: FileText },
      { to: '/financing', label: 'Financing progress', icon: Wallet }
    ],
    BUYER: [
      { to: '/', label: 'Overview', icon: LayoutDashboard }, { to: '/invoices', label: 'Invoices to review', icon: FileCheck2 }
    ],
    FINANCE: [
      { to: '/', label: 'Overview', icon: LayoutDashboard }, { to: '/invoices', label: 'All invoices', icon: FileText },
      { to: '/parties', label: 'Parties', icon: Users }, { to: '/financing', label: 'Financing book', icon: Wallet },
      { to: '/operations', label: 'Risk & payments', icon: CircleDollarSign }, { to: '/analytics', label: 'Event analytics', icon: BarChart3 },
      { to: '/spark', label: 'Spark monitor', icon: Sparkles }
    ],
    ADMIN: [
      { to: '/', label: 'Platform overview', icon: LayoutDashboard }, { to: '/invoices', label: 'All invoices', icon: FileText },
      { to: '/parties', label: 'Party administration', icon: Building2 }, { to: '/financing', label: 'Financing portfolio', icon: Wallet },
      { to: '/operations', label: 'Risk & payments', icon: CircleDollarSign }, { to: '/simulator', label: 'Data simulator', icon: Database },
      { to: '/analytics', label: 'Event analytics', icon: BarChart3 }, { to: '/spark', label: 'Spark monitor', icon: Sparkles }
    ]
  };

  const accept = (id: string) => act(() => postJson(`/invoices/${id}/accept`), `Invoice ${id} accepted. Risk assessment will run asynchronously.`);
  const reject = (id: string) => act(() => postJson(`/invoices/${id}/reject`), `Invoice ${id} rejected by buyer.`);

  const Sidebar = () => <aside><div className="brand"><div className="brand-mark">IF</div><div><b>InvoiceFlow</b><small>Receivables finance</small></div></div><div className="role"><label>DEMO WORKSPACE</label><select value={role} onChange={e => { setRole(e.target.value as Role); setNotice('Workspace switched. Data remains synthetic and role selection is not authentication.'); }}><option value="SUPPLIER">SUPPLIER</option><option value="BUYER">BUYER</option><option value="FINANCE">FINANCE</option><option value="ADMIN">ADMIN</option></select><small className="role-user">{roleInfo[role].label}</small></div><nav>{navByRole[role].map(n => <NavLink key={n.to} to={n.to} end={n.to === '/'}><n.icon size={17} />{n.label}</NavLink>)}</nav><div className="side-foot"><ShieldCheck size={16} /> Demo-only access · not production auth</div></aside>;
  const Header = () => <header><span>Invoice discounting platform · {roleInfo[role].description}</span><div className="header-right"><button className="icon-btn" onClick={reload} title="Refresh service data"><RefreshCw size={16} /></button><span className="user"><span className="avatar">{role[0]}</span>{roleInfo[role].label.toUpperCase()}</span></div></header>;

  const Dashboard = () => {
    const ownInvoices = visibleInvoices.length;
    const totalOwnAmount = visibleInvoices.reduce((s, x) => s + Number(x.amount || 0), 0);
    const metrics = role === 'SUPPLIER' ? [
      ['My invoices', ownInvoices, 'Invoices raised by SUP-001'], ['Awaiting buyer', visibleInvoices.filter(x => x.status === 'SUBMITTED').length, 'Pending customer action'],
      ['Accepted', visibleInvoices.filter(x => x.status === 'ACCEPTED').length, 'Accepted receivables'], ['Approved financing', supplierFinancing.filter(x => pick(x, 'status', 'STATUS') === 'APPROVED').length, 'Eligible applications']
    ] : role === 'BUYER' ? [
      ['Invoices for me', ownInvoices, 'Buyer: BUY-001'], ['Awaiting review', buyerPending.length, 'Require buyer decision'],
      ['Accepted', visibleInvoices.filter(x => x.status === 'ACCEPTED').length, 'Confirmed obligations'], ['Rejected', visibleInvoices.filter(x => x.status === 'REJECTED_BY_BUYER').length, 'Buyer decisions']
    ] : role === 'FINANCE' ? [
      ['Accepted invoices', summary?.invoiceAccepted ?? 0, 'Buyer approval events'], ['Risk decisions', risks.length, 'Evaluated invoices'],
      ['Financing approvals', summary?.financingApproved ?? 0, 'Eligible requests'], ['Simulated payouts', payments.length, 'No real funds movement']
    ] : [
      ['Total invoices', invoices.length, 'Across the demo platform'], ['Parties', parties.length, 'Buyers and suppliers'],
      ['Domain events', summary?.eventCount ?? 0, 'Read Model event log'], ['Spark events', spark?.totalEvents ?? '—', 'Analytics pipeline']
    ];
    return <Page title={role === 'SUPPLIER' ? 'My receivables' : role === 'BUYER' ? 'Buyer workspace' : role === 'FINANCE' ? 'Finance operations' : 'Platform overview'} subtitle={roleInfo[role].description} notice={notice} right={<span className="status">POC environment</span>}>
      <div className="metrics">{metrics.map((m, i) => <Metric key={i} label={String(m[0])} value={m[1] as ReactNode} note={String(m[2])} />)}</div>
      <div className="two-col"><div className="panel"><div className="panel-title"><h2>{role === 'BUYER' ? 'Approval work queue' : role === 'SUPPLIER' ? 'Receivables position' : 'Invoice pipeline'}</h2><Activity size={18} /></div>
        {role === 'SUPPLIER' ? <><div className="big-number">{money(totalOwnAmount)}</div><p className="muted">Total invoice value in your demo supplier workspace.</p><div className="pipeline"><div className="pipeline-step"><span>1</span>Submitted</div><div className="pipeline-step"><span>2</span>Buyer accepted</div><div className="pipeline-step"><span>3</span>Risk review</div></div></> : role === 'BUYER' ? <><div className="big-number">{buyerPending.length}</div><p className="muted">Invoices awaiting your confirmation. Accepting an invoice publishes an event that starts risk evaluation.</p><NavLink className="primary-link" to="/invoices">Review invoices</NavLink></> : <div className="pipeline">{['Invoice created','Buyer accepted','Risk evaluated','Financing approved','Payment simulated','Reconciled'].map((s, i) => <div className="pipeline-step" key={s}><span>{i + 1}</span>{s}</div>)}</div>}
      </div><div className="panel"><h2>Platform activity</h2><div className="big-number">{summary?.eventCount ?? '—'}</div><p className="muted">Domain events consumed by the Read Model from RabbitMQ.</p><div className="event-stats"><span>Risk checks <b>{summary?.riskCompleted ?? 0}</b></span><span>Approved <b>{summary?.financingApproved ?? 0}</b></span><span>Reconciled <b>{summary?.reconciliationsCompleted ?? 0}</b></span></div></div></div>
      <div className="panel"><div className="panel-title"><h2>{role === 'BUYER' ? 'Invoices requiring attention' : role === 'SUPPLIER' ? 'My recent invoices' : 'Recent platform invoices'}</h2><NavLink to="/invoices">Open register →</NavLink></div><InvoiceTable rows={visibleInvoices.slice(0, 6)} role={role} busy={busy} onAccept={accept} onReject={reject} /></div>
    </Page>;
  };

  const InvoiceTable = ({ rows, role: tableRole, busy: tableBusy, onAccept, onReject }: { rows: Invoice[]; role: Role; busy: boolean; onAccept: (id: string) => void; onReject: (id: string) => void }) => <TableFrame><thead><tr><th>Invoice</th><th>Supplier</th><th>Buyer</th><th>Amount</th><th>Due date</th><th>Status</th>{tableRole === 'BUYER' && <th>Decision</th>}</tr></thead><tbody>{rows.map(r => <tr key={r.invoiceId}><td><b>{r.invoiceNumber}</b><small className="subid">{r.invoiceId}</small></td><td>{r.supplierId}</td><td>{r.buyerId}</td><td>{money(Number(r.amount), r.currency)}</td><td>{String(r.dueDate).slice(0, 10)}</td><td><span className={`pill ${String(r.status).toLowerCase()}`}>{r.status}</span></td>{tableRole === 'BUYER' && <td>{r.status === 'SUBMITTED' ? <div className="action-row"><button className="small-btn" disabled={tableBusy} onClick={() => onAccept(r.invoiceId)}>Accept</button><button className="small-btn danger-btn" disabled={tableBusy} onClick={() => onReject(r.invoiceId)}>Reject</button></div> : '—'}</td>}</tr>)}</tbody></TableFrame>;

  const InvoicePage = () => {
    const canCreate = role === 'SUPPLIER' || role === 'ADMIN';
    const create = () => act(() => postJson('/invoices', { supplierId: formSupplier, buyerId: formBuyer, invoiceNumber: formInvoiceNumber, currency: 'INR', amount: Number(formAmount), issueDate: new Date().toISOString().slice(0, 10), dueDate: formDue }), 'Invoice created as SUBMITTED. The buyer must accept it before risk evaluation begins.');
    return <Page title={role === 'BUYER' ? 'Invoice approval queue' : role === 'SUPPLIER' ? 'My invoices' : 'Invoice register'} subtitle={role === 'BUYER' ? 'Review the invoices addressed to your buyer account.' : 'Track invoice records and their lifecycle status.'} notice={notice}>
      {canCreate && <div className="panel form-panel"><h2>Create an invoice</h2><p className="muted">The supplier submits a receivable. Buyer acceptance is a separate step.</p><div className="form-grid"><label>Supplier<select value={formSupplier} disabled={role === 'SUPPLIER'} onChange={e => setFormSupplier(e.target.value)}>{parties.filter(p => p.partyType === 'SUPPLIER').map(p => <option key={p.partyId} value={p.partyId}>{p.partyId} · {p.legalName}</option>)}</select></label><label>Buyer<select value={formBuyer} onChange={e => setFormBuyer(e.target.value)}>{parties.filter(p => p.partyType === 'BUYER').map(p => <option key={p.partyId} value={p.partyId}>{p.partyId} · {p.legalName}</option>)}</select></label><label>Invoice number<input value={formInvoiceNumber} onChange={e => setFormInvoiceNumber(e.target.value)} /></label><label>Amount (INR)<input type="number" min="1" value={formAmount} onChange={e => setFormAmount(e.target.value)} /></label><label>Due date<input type="date" value={formDue} onChange={e => setFormDue(e.target.value)} /></label></div><button className="primary-btn" disabled={busy || !formInvoiceNumber || Number(formAmount) <= 0} onClick={create}><Plus size={16} /> Submit invoice</button></div>}
      <div className="panel"><div className="panel-title"><h2>{role === 'BUYER' ? 'Invoices addressed to my organisation' : role === 'SUPPLIER' ? 'My submitted receivables' : 'All invoice records'}</h2><span className="muted">{visibleInvoices.length} records</span></div><InvoiceTable rows={visibleInvoices} role={role} busy={busy} onAccept={accept} onReject={reject} />{!visibleInvoices.length && <Empty>No invoices found for this demo workspace.</Empty>}</div>
    </Page>;
  };

  const PartiesPage = () => {
    const createParty = () => act(() => postJson('/parties', { partyType, legalName: partyName, email: partyEmail, countryCode: 'IN' }), 'Party created in Party Service.');
    return <Page title="Party directory" subtitle="Buyer and supplier master data owned by Party Service." notice={notice}>
      {role === 'ADMIN' && <div className="panel form-panel"><h2>Add a buyer or supplier</h2><div className="form-grid"><label>Party type<select value={partyType} onChange={e => setPartyType(e.target.value)}><option>SUPPLIER</option><option>BUYER</option></select></label><label>Legal name<input value={partyName} onChange={e => setPartyName(e.target.value)} placeholder="Registered business name" /></label><label>Email<input value={partyEmail} onChange={e => setPartyEmail(e.target.value)} placeholder="accounts@example.test" /></label></div><button className="primary-btn" disabled={busy || !partyName.trim()} onClick={createParty}><Plus size={16} /> Add party</button></div>}
      <div className="panel"><div className="panel-title"><h2>Registered parties</h2><span className="muted">{parties.length} records</span></div><TableFrame><thead><tr><th>Party ID</th><th>Type</th><th>Legal name</th><th>Email</th><th>Country</th><th>Status</th></tr></thead><tbody>{parties.map(p => <tr key={p.partyId}><td>{p.partyId}</td><td>{p.partyType}</td><td>{p.legalName}</td><td>{p.email}</td><td>{p.countryCode}</td><td><span className="pill accepted">{p.status}</span></td></tr>)}</tbody></TableFrame></div>
    </Page>;
  };

  const FinancingPage = () => {
    const rows = role === 'SUPPLIER' ? supplierFinancing : financing;
    return <Page title={role === 'SUPPLIER' ? 'My financing progress' : 'Financing portfolio'} subtitle="Financing Service evaluates risk-approved invoices and records POC approvals." notice={notice}>
      <div className="metrics"><Metric label="Applications" value={rows.length} note="Financing requests" icon={ClipboardList} /><Metric label="Approved" value={rows.filter(x => pick(x, 'status', 'STATUS') === 'APPROVED').length} note="Eligible records" icon={CheckCircle2} /><Metric label="Approved value" value={money(rows.reduce((s, x) => s + Number(pick(x, 'approved_amount', 'APPROVED_AMOUNT', 'approvedAmount') || 0), 0))} note="Calculated advance amount" icon={CircleDollarSign} /><Metric label="Portfolio approved" value={money(approvedAmount)} note="Across the POC platform" icon={Wallet} /></div>
      <div className="panel"><h2>Financing applications</h2>{rows.length ? <TableFrame><thead><tr><th>Financing ID</th><th>Invoice ID</th><th>Requested</th><th>Approved</th><th>Discount rate</th><th>Status</th></tr></thead><tbody>{rows.map((x, i) => <tr key={pick(x, 'financing_id', 'FINANCING_ID', 'financingId') || i}><td>{pick(x, 'financing_id', 'FINANCING_ID', 'financingId')}</td><td>{pick(x, 'invoice_id', 'INVOICE_ID', 'invoiceId')}</td><td>{money(pick(x, 'requested_amount', 'REQUESTED_AMOUNT', 'requestedAmount'))}</td><td>{money(pick(x, 'approved_amount', 'APPROVED_AMOUNT', 'approvedAmount'))}</td><td>{Number(pick(x, 'discount_rate', 'DISCOUNT_RATE', 'discountRate') || 0) * 100}%</td><td><span className="pill accepted">{pick(x, 'status', 'STATUS')}</span></td></tr>)}</tbody></TableFrame> : <Empty>No financing applications have been created yet. A buyer must accept an invoice first.</Empty>}</div>
      <div className="notice subtle-notice">POC rule: eligible invoices receive an approval equal to 90% of invoice value. Payment is simulated; the 2% discount rate is stored but not deducted in the current approval calculation.</div>
    </Page>;
  };

  const OperationsPage = () => <Page title="Risk, payments & reconciliation" subtitle="Operational records from the independent service databases." notice={notice}>
    <div className="metrics"><Metric label="Risk decisions" value={risks.length} note="Risk Service" /><Metric label="Financing records" value={financing.length} note="Financing Service" /><Metric label="Payments" value={payments.length} note="Payment Service · simulated" /><Metric label="Reconciliations" value={reconciliations.length} note="POC matching records" /></div>
    <div className="panel"><h2>Risk decisions</h2>{risks.length ? <TableFrame><thead><tr><th>Invoice</th><th>Eligible</th><th>Score</th><th>Reason</th></tr></thead><tbody>{risks.map((x, i) => <tr key={i}><td>{pick(x, 'invoice_id', 'INVOICE_ID')}</td><td>{String(pick(x, 'eligible', 'ELIGIBLE'))}</td><td>{pick(x, 'score', 'SCORE')}</td><td>{pick(x, 'reason', 'REASON')}</td></tr>)}</tbody></TableFrame> : <Empty>No risk decisions yet. Accept an invoice as Buyer to start this stage.</Empty>}</div>
    <div className="panel"><h2>Simulated payments</h2>{payments.length ? <TableFrame><thead><tr><th>Payment</th><th>Invoice</th><th>Reference</th><th>Amount</th><th>Status</th></tr></thead><tbody>{payments.map((x, i) => <tr key={i}><td>{pick(x, 'payment_id', 'PAYMENT_ID')}</td><td>{pick(x, 'invoice_id', 'INVOICE_ID')}</td><td>{pick(x, 'payment_reference', 'PAYMENT_REFERENCE')}</td><td>{money(pick(x, 'amount', 'AMOUNT'), pick(x, 'currency', 'CURRENCY') || 'INR')}</td><td><span className="pill accepted">{pick(x, 'status', 'STATUS')}</span></td></tr>)}</tbody></TableFrame> : <Empty>No simulated disbursements yet.</Empty>}</div>
    <div className="panel"><h2>Reconciliation records</h2>{reconciliations.length ? <TableFrame><thead><tr><th>Reconciliation</th><th>Invoice</th><th>Matched amount</th><th>Status</th><th>Reason</th></tr></thead><tbody>{reconciliations.map((x, i) => <tr key={i}><td>{pick(x, 'reconciliation_id', 'RECONCILIATION_ID')}</td><td>{pick(x, 'invoice_id', 'INVOICE_ID')}</td><td>{money(pick(x, 'matched_amount', 'MATCHED_AMOUNT'), pick(x, 'currency', 'CURRENCY') || 'INR')}</td><td>{pick(x, 'match_status', 'MATCH_STATUS')}</td><td>{pick(x, 'reason', 'REASON')}</td></tr>)}</tbody></TableFrame> : <Empty>No reconciliation records yet.</Empty>}</div>
  </Page>;

  const AnalyticsPage = () => <Page title="Event analytics" subtitle="Domain events captured by the Java Read Model Service from RabbitMQ." notice={notice}>
    <div className="metrics six"><Metric label="Total events" value={summary?.eventCount ?? 0} /><Metric label="Created" value={summary?.invoiceCreated ?? 0} /><Metric label="Accepted" value={summary?.invoiceAccepted ?? 0} /><Metric label="Risk checks" value={summary?.riskCompleted ?? 0} /><Metric label="Approvals" value={summary?.financingApproved ?? 0} /><Metric label="Reconciled" value={summary?.reconciliationsCompleted ?? 0} /></div>
    <div className="panel"><div className="panel-title"><h2>Recent domain events</h2><span className="muted">RabbitMQ → Read Model</span></div>{(summary?.recentEvents || []).length ? <TableFrame><thead><tr><th>Event type</th><th>Aggregate</th><th>Event ID</th><th>Occurred</th></tr></thead><tbody>{summary?.recentEvents.map(e => <tr key={e.eventId}><td><code className="event-type">{e.eventType}</code></td><td>{e.aggregateId}</td><td>{e.eventId}</td><td>{new Date(e.occurredAt).toLocaleString()}</td></tr>)}</tbody></TableFrame> : <Empty>No events have been consumed by Read Model yet.</Empty>}</div>
  </Page>;

  const SparkPage = () => <Page title="Spark analytics monitor" subtitle="Scala microservice → RabbitMQ → Spark Structured Streaming → analytics API." notice={notice} right={<a className="primary-link" href="http://localhost:4040" target="_blank" rel="noreferrer">Open native Spark UI ↗</a>}>
    <div className="metrics"><Metric label="Spark service" value={spark?.running ? 'RUNNING' : 'NOT CONNECTED'} note={spark?.language || 'Scala service'} icon={Sparkles} /><Metric label="Events processed" value={spark?.totalEvents ?? '—'} note="Spark micro-batch total" icon={Activity} /><Metric label="Last batch" value={spark?.lastBatchId ?? '—'} note="Structured Streaming" icon={Gauge} /><Metric label="Engine" value={spark?.engine ? 'Spark SQL' : '—'} note={spark?.engine || 'Waiting for analytics service'} icon={Database} /></div>
    {!spark && <div className="notice warning-notice">Spark analytics service did not respond. Start it with: docker compose --env-file .env -f infra/docker-compose.yml --profile analytics up --build -d</div>}
    <div className="two-col"><div className="panel"><h2>Events by type</h2>{spark?.byEventType && Object.keys(spark.byEventType).length ? Object.entries(spark.byEventType).sort((a,b) => b[1]-a[1]).map(([name, count]) => <div className="bar-row" key={name}><span>{name}</span><div className="bar-track"><div className="bar-fill" style={{ width: `${Math.max(2, count / Math.max(1, spark.totalEvents) * 100)}%` }} /></div><b>{count}</b></div>) : <Empty>Waiting for domain events in the analytics queue.</Empty>}</div><div className="panel"><h2>Streaming application</h2><dl className="detail-list"><dt>Implementation</dt><dd>Scala 2.12 · Spark Structured Streaming</dd><dt>Rabbit queue</dt><dd>analytics.domain-events</dd><dt>Raw landing</dt><dd>/data/events · JSON files</dd><dt>Checkpoint</dt><dd>/data/spark-checkpoint</dd><dt>Last batch ID</dt><dd>{spark?.lastBatchId ?? '—'}</dd></dl><a className="primary-link" href="http://localhost:4040" target="_blank" rel="noreferrer">Inspect Jobs, Stages, SQL and Executors ↗</a></div></div>
    <div className="panel"><h2>Recent events seen by Spark</h2>{sparkEvents.length ? <TableFrame><thead><tr><th>Event</th><th>Aggregate</th><th>Producer</th><th>Occurred</th></tr></thead><tbody>{sparkEvents.map((e, i) => <tr key={e.eventId || i}><td><code className="event-type">{e.eventType}</code></td><td>{e.aggregateId}</td><td>{e.producer}</td><td>{e.occurredAt}</td></tr>)}</tbody></TableFrame> : <Empty>No Spark-processed events yet. The Scala service must be running and receiving RabbitMQ events.</Empty>}</div>
    <p className="muted">The native Spark UI is available only while the Spark application is running. The React page reads live metrics from the Scala service. Snowflake ingestion remains a separate credentialed job.</p>
  </Page>;

  const SimulatorPage = () => {
    const generate = async () => { const response = await act(() => postJson('/invoices/demo/generate', { count: Number(generationCount) }), 'Synthetic demo batch created. Accepted invoices will flow through risk and financing asynchronously.'); if (response) setGenerationResult(response); };
    return <Page title="Demo data simulator" subtitle="Create linked synthetic invoices to exercise the complete event-driven workflow." notice={notice}>
      <div className="panel form-panel"><h2>Generate transaction scenarios</h2><div className="form-grid"><label>Number of invoices<select value={generationCount} onChange={e => setGenerationCount(e.target.value)}>{['4','8','12','20','30','50'].map(v => <option key={v}>{v}</option>)}</select></label></div><button className="primary-btn" disabled={busy} onClick={generate}><Sparkles size={16} /> Generate demo transactions</button><p className="muted">Includes eligible amounts, an amount above the ₹50 lakh POC limit, and invoices left SUBMITTED for buyer review. Each invoice uses an existing demo supplier and buyer.</p></div>
      {generationResult && <div className="panel"><h2>Generation result · {generationResult.count} invoices</h2><p className="muted">{generationResult.message}</p><TableFrame><thead><tr><th>Invoice</th><th>Supplier</th><th>Buyer</th><th>Amount</th><th>Created status</th><th>Risk scenario</th></tr></thead><tbody>{generationResult.created.map((x: any) => <tr key={x.invoiceId}><td>{x.invoiceNumber}<small className="subid">{x.invoiceId}</small></td><td>{x.supplierId}</td><td>{x.buyerId}</td><td>{money(x.amount)}</td><td>{x.status}</td><td>{x.expectedRisk}</td></tr>)}</tbody></TableFrame></div>}
      <div className="notice subtle-notice">This simulator creates synthetic demo records only. It does not move funds, send real customer notifications or alter external banking systems.</div>
    </Page>;
  };

  return <div className="shell"><Sidebar /><main><Header /><Routes>
    <Route path="/" element={<Dashboard />} />
    <Route path="/invoices" element={<InvoicePage />} />
    <Route path="/parties" element={role === 'FINANCE' || role === 'ADMIN' ? <PartiesPage /> : <Navigate to="/" replace />} />
    <Route path="/financing" element={role === 'SUPPLIER' || role === 'FINANCE' || role === 'ADMIN' ? <FinancingPage /> : <Navigate to="/" replace />} />
    <Route path="/operations" element={role === 'FINANCE' || role === 'ADMIN' ? <OperationsPage /> : <Navigate to="/" replace />} />
    <Route path="/analytics" element={role === 'FINANCE' || role === 'ADMIN' ? <AnalyticsPage /> : <Navigate to="/" replace />} />
    <Route path="/spark" element={role === 'FINANCE' || role === 'ADMIN' ? <SparkPage /> : <Navigate to="/" replace />} />
    <Route path="/simulator" element={role === 'ADMIN' ? <SimulatorPage /> : <Navigate to="/" replace />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes><footer>InvoiceFlow POC · Synthetic data · Simulated payments only · Demo role selection is not authentication</footer></main></div>;
}

export default App;
