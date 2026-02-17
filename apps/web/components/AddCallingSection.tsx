'use client';

import { useRouter } from 'next/navigation';

import { AddCallingForm } from '@/components/AddCallingForm';

type AddCallingSectionProps = {
  wardId: string;
  standardCallings: string[];
};

export function AddCallingSection({ wardId, standardCallings }: AddCallingSectionProps) {
  const router = useRouter();

  return (
    <AddCallingForm
      wardId={wardId}
      standardCallings={standardCallings}
      onSuccess={() => router.refresh()}
    />
  );
}
