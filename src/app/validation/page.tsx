import type { Metadata } from 'next';
import ValidationDashboard from '@/components/validation-dashboard';
import '@/styles/validation.css';

export const metadata: Metadata = { title: 'Validation' };

export default function ValidationPage() {
  return <ValidationDashboard />;
}
