import { redirect } from 'next/navigation';

export default function BillingRedirectPage(): never {
  redirect('/subscription');
}
