// app/lib/actions.ts
'use server';

import { z } from 'zod';
import postgres from 'postgres';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

/* -------------------------
   Zod form schema
   -------------------------*/
const FormSchema = z.object({
  id: z.string().optional(),
  customerId: z.string({
    invalid_type_error: 'Please select a customer.',
  }).nonempty('Please select a customer.'),
  amount: z.coerce
    .number()
    .gt(0, { message: 'Please enter an amount greater than $0.' }),
  status: z.enum(['pending', 'paid'], {
    invalid_type_error: 'Please select an invoice status.',
  }),
  date: z.string().optional(),
});

const CreateInvoice = FormSchema.omit({ id: true, date: true });
const UpdateInvoice = CreateInvoice;

/* -------------------------
   Helpers
   -------------------------*/
function getString(formData: FormData, key: string) {
  const v = formData.get(key);
  return v === null ? '' : String(v);
}

function getNumber(formData: FormData, key: string) {
  const v = formData.get(key);
  if (v === null || v === '') return NaN;
  return Number(v);
}

/* -------------------------
   Actions
   -------------------------*/

export type State = {
  errors?: {
    customerId?: string[];
    amount?: string[];
    status?: string[];
  };
  message?: string | null;
};

export async function createInvoice(prevState: State, formData: FormData) {
  const payload = {
    customerId: getString(formData, 'customerId'),
    amount: getNumber(formData, 'amount'),
    status: getString(formData, 'status'),
  };

  const parsed = CreateInvoice.safeParse(payload);
  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors,
      message: 'Validation Error: Invalid invoice data.',
    };
  }

  const { customerId, amount, status } = parsed.data;
  const amountInCents = Math.round(amount * 100);
  const date = new Date().toISOString().split('T')[0];

  try {
    await sql`
      INSERT INTO invoices (customer_id, amount, status, date)
      VALUES (${customerId}, ${amountInCents}, ${status}, ${date})
    `;
  } catch (error) {
    console.error('Database Error (createInvoice):', error);
    return { message: 'Database Error: Failed to create invoice.' };
  }

  revalidatePath('/dashboard/invoices');
  redirect('/dashboard/invoices');
}

export async function updateInvoice(prevState: State, id: string, formData: FormData) {
  if (!id) return { message: 'Missing invoice id' };

  const payload = {
    customerId: getString(formData, 'customerId'),
    amount: getNumber(formData, 'amount'),
    status: getString(formData, 'status'),
  };

  const parsed = UpdateInvoice.safeParse(payload);
  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors,
      message: 'Validation Error: Invalid invoice data.',
    };
  }

  const { customerId, amount, status } = parsed.data;
  const amountInCents = Math.round(amount * 100);

  try {
    await sql`
      UPDATE invoices
      SET customer_id = ${customerId}, amount = ${amountInCents}, status = ${status}
      WHERE id = ${id}
    `;
  } catch (error) {
    console.error('Database Error (updateInvoice):', error);
    return { message: 'Database Error: Failed to update invoice.' };
  }

  revalidatePath('/dashboard/invoices');
  redirect('/dashboard/invoices');
}

export async function deleteInvoice(prevState: State, id: string) {
  if (!id) return { message: 'Missing invoice id' };

  try {
    await sql`DELETE FROM invoices WHERE id = ${id}`;
  } catch (error) {
    console.error('Database Error (deleteInvoice):', error);
    return { message: 'Database Error: Failed to delete invoice.' };
  }

  revalidatePath('/dashboard/invoices');
  redirect('/dashboard/invoices');
}
