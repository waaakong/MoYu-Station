import type { ProviderId } from '@studyroom/contracts';
import type { CloudClient } from '../../main/cloud/client';
import { ProviderError } from './providerErrors';

/** Main-process identity only. Renderer auth flags and platform cookies are not MoYu identity. */
export class ProviderApplicationAccess {
  private checking?: Promise<void>;
  constructor(private readonly cloud: CloudClient, private readonly readBinding: (id: ProviderId) => string | undefined,
    private readonly writeBinding: (id: ProviderId, owner: string) => void) {}
  bound(id: ProviderId): boolean { return !!this.cloud.authenticatedOwner && this.readBinding(id) === this.cloud.authenticatedOwner; }
  bind(id: ProviderId): void {
    if (!this.cloud.authenticatedOwner) throw new ProviderError('PROVIDER_APP_LOGIN_REQUIRED');
    this.writeBinding(id, this.cloud.authenticatedOwner);
  }
  async authorize(id: ProviderId, mode: 'use' | 'login' | 'refresh'): Promise<() => void> {
    if (!this.checking) {
      const pending = this.cloud.request({method:'GET',path:'/auth/me'}).then(result => {
        if (result.status !== 200 || !this.cloud.authenticatedOwner) throw new ProviderError('PROVIDER_APP_LOGIN_REQUIRED');
      });
      this.checking = pending;
      void pending.finally(() => { if (this.checking === pending) this.checking = undefined; }).catch(() => {});
    }
    await this.checking;
    const owner = this.cloud.authenticatedOwner, epoch = this.cloud.identityEpoch;
    if (!owner) throw new ProviderError('PROVIDER_APP_LOGIN_REQUIRED');
    if (mode !== 'login' && !this.bound(id)) throw new ProviderError('PROVIDER_LOGIN_REQUIRED');
    return () => {
      if (owner !== this.cloud.authenticatedOwner || epoch !== this.cloud.identityEpoch) throw new ProviderError('PROVIDER_APP_LOGIN_REQUIRED');
      if (mode !== 'login' && !this.bound(id)) throw new ProviderError('PROVIDER_LOGIN_REQUIRED');
    };
  }
}
