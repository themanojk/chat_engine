export interface TenantScope {
  tenantId: string;
}

export interface ActorScope extends TenantScope {
  actorUserId: string;
}
