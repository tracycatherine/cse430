import postgres from 'postgres';
import {
  CustomerField,
  CustomersTableType,
  InvoiceForm,
  InvoicesTable,
  LatestInvoiceRaw,
  Revenue,
} from './definitions';
import { formatCurrency } from './utils';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

// Fetch revenue data
export async function fetchRevenue() {
  try {
    const data = await sql<Revenue[]>`SELECT * FROM revenue`;
    return data;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch revenue data.');
  }
}

// Fetch latest 5 invoices
export async function fetchLatestInvoices() {
  try {
    const data = await sql<LatestInvoiceRaw[]>`
      SELECT invoices.amount, customers.name, customers.image_url, customers.email, invoices.id
      FROM invoices
      JOIN customers ON invoices.customer_id = customers.id
      ORDER BY invoices.date DESC
      LIMIT 5
    `;
    return data.map(invoice => ({
      ...invoice,
      amount: formatCurrency(invoice.amount),
    }));
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch latest invoices.');
  }
}

// Fetch card data for dashboard
export async function fetchCardData() {
  try {
    const invoiceCountPromise = sql`SELECT COUNT(*) FROM invoices`;
    const customerCountPromise = sql`SELECT COUNT(*) FROM customers`;
    const invoiceStatusPromise = sql`
      SELECT
        SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) AS "paid",
        SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) AS "pending"
      FROM invoices
    `;

    const data = await Promise.all([invoiceCountPromise, customerCountPromise, invoiceStatusPromise]);

    return {
      numberOfInvoices: Number(data[0][0].count ?? '0'),
      numberOfCustomers: Number(data[1][0].count ?? '0'),
      totalPaidInvoices: formatCurrency(data[2][0].paid ?? '0'),
      totalPendingInvoices: formatCurrency(data[2][0].pending ?? '0'),
    };
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch card data.');
  }
  
}

// place near the other exported fetch... functions
const PAGE_SIZE = 10; // change as needed

export async function fetchFilteredInvoices(query: string, currentPage = 1) {
  try {
    const offset = (Math.max(1, currentPage) - 1) * PAGE_SIZE;

    // Basic search across invoice id, status, and customer name/email
    // Adjust column names to match your DB schema
    const searchTerm = `%${query ? query.trim() : ''}%`;

    const data = await sql<{
      id: string;
      amount: number;
      date: string;
      status: string;
      name: string | null;
      email: string | null;
      image_url: string | null;
    }[]>`
      SELECT
        invoices.id,
        invoices.amount,
        invoices.date,
        invoices.status,
        customers.name,
        customers.email,
        customers.image_url
      FROM invoices
      LEFT JOIN customers ON invoices.customer_id = customers.id
      WHERE
        (${query && query.trim().length > 0}
          ? (invoices.id ILIKE ${searchTerm}
             OR invoices.status ILIKE ${searchTerm}
             OR customers.name ILIKE ${searchTerm}
             OR customers.email ILIKE ${searchTerm})
          : true)
      ORDER BY invoices.date DESC
      LIMIT ${PAGE_SIZE} OFFSET ${offset}
    `;

    // Map DB rows to shape expected by your UI (adjust fields if necessary)
    return data.map(row => ({
      id: row.id,
      name: row.name ?? 'Unknown',
      email: row.email ?? '',
      amount: row.amount,
      date: row.date,
      status: row.status,
      image_url: row.image_url ?? ''
    }));
  } catch (error) {
    console.error('Failed to fetch filtered invoices:', error);
    throw new Error('Failed to fetch filtered invoices.');
  }
}
