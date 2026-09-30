import { useState, useSyncExternalStore, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, getDashboardSummary } from '@workspace/api-client-react';
import { LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  acceptDemoToken, getDemoAccessState, lockDemoAccess, subscribeDemoAccess,
} from '@/lib/demo-access';

export function DemoAccessDialog() {
  const access = useSyncExternalStore(subscribeDemoAccess, getDemoAccessState);
  const [key, setKey] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const queries = useQueryClient();

  const unlock = async (event: FormEvent) => {
    event.preventDefault();
    setChecking(true);
    setError('');
    try {
      // Validate through the same generated client; the candidate is not persisted yet.
      await getDashboardSummary({ headers: { Authorization: `Bearer ${key}` } });
      acceptDemoToken(key);
      setKey('');
      // Re-fetch reads after reauthentication. Failed mutations require an explicit retry.
      void queries.invalidateQueries();
    } catch (failure) {
      setKey('');
      setError(failure instanceof ApiError && failure.status === 401
        ? 'Access key was not accepted. Try again.'
        : 'Unable to unlock demo access. Check the connection and that session storage is enabled.');
    } finally {
      setChecking(false);
    }
  };

  return <>
    {!access.open && <div className="fixed bottom-4 right-4 z-40"><Button variant="outline" className="bg-white" onClick={lockDemoAccess} data-testid="button-lock-demo"><LockKeyhole className="h-4 w-4" /> Lock demo</Button></div>}
    <Dialog open={access.open}>
      <DialogContent className="w-[calc(100%-2rem)] [&>button]:hidden" onEscapeKeyDown={event => event.preventDefault()} onPointerDownOutside={event => event.preventDefault()}>
        <DialogTitle>Demo access key</DialogTitle>
        <DialogDescription>Enter the key shared privately by the demo host. It is kept only for this tab’s browser session.</DialogDescription>
        <form onSubmit={unlock} className="space-y-4">
          <label className="block text-sm font-medium">Access key
            <input type="password" autoComplete="off" autoCapitalize="none" spellCheck={false} required minLength={32} maxLength={512} value={key} onChange={event => { setKey(event.target.value); setError(''); }} disabled={checking} data-testid="input-demo-key" className="mt-2 h-11 w-full rounded-lg border border-[hsl(var(--input))] bg-white px-3 outline-none focus:border-[hsl(var(--accent))]" />
          </label>
          {(error || access.message) && <p role="alert" className="text-sm text-red-700">{error || access.message}</p>}
          <Button type="submit" disabled={checking || key.length < 32} className="w-full" data-testid="button-unlock-demo">{checking ? 'Checking access…' : 'Unlock demo'}</Button>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}
