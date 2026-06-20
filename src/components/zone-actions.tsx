'use client';

import { useRouter } from 'next/navigation';
import type { ConvenienceZone } from '@/stores/simsettings';
import Button from './ui/button';

interface ZoneActionsProps {
  zone: ConvenienceZone | null;
  setZone: (zone: ConvenienceZone) => void;
  locations: ConvenienceZone[];
  setLocations: React.Dispatch<React.SetStateAction<ConvenienceZone[]>>;
}

// NOTE: the "Clear My Zones" bulk-delete control was removed while zones are
// shared/public — a single click could delete an account's demo zones (and
// cascade-delete their runs) for everyone. Re-introduce it alongside private
// zones. The DELETE endpoint and forgetGuestZoneClaims() helper remain in place.
export default function ZoneActions(_props: ZoneActionsProps) {
  const router = useRouter();

  return (
    <div className="flex gap-2 items-start justify-center">
      <Button
        type="button"
        className="w-42 p-2!"
        onClick={() => router.push('/cz-generation')}
      >
        + Generate Zone
      </Button>
    </div>
  );
}
