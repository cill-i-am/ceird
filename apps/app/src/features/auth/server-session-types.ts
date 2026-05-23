export interface ServerAuthSession {
  readonly session: {
    readonly id: string;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly userId: string;
    readonly expiresAt: string;
    readonly token: string;
    readonly ipAddress?: string | null | undefined;
    readonly userAgent?: string | null | undefined;
    readonly activeOrganizationId?: string | null | undefined;
  };
  readonly user: {
    readonly id: string;
    readonly name: string;
    readonly email: string;
    readonly image?: string | null | undefined;
    readonly emailVerified: boolean;
    readonly createdAt: string;
    readonly updatedAt: string;
  };
}
