export type ApiCloudflarePlugin = {
  id: string;
  company_id: string;
  installed: boolean;
  enabled: boolean;
  account_status: string;
  account_id: string;
  account_name: string;
  auth_method: "manual" | "oauth";
  oauth_available: boolean;
  oauth_client_id_set?: boolean;
  oauth_client_secret_set?: boolean;
  oauth_client_id?: string;
  api_token_set: boolean;
  api_token_hint: string;
  media_storage: "local" | "r2";
  r2_status: string;
  r2_bucket: string;
  r2_access_key_set: boolean;
  r2_public_base_url: string;
  images_status: string;
  images_account_hash: string;
  images_api_token_set: boolean;
  images_api_token_hint: string;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ApiCloudflareOAuthAuthorizeResponse = {
  data: { url: string };
};

export type ApiCloudflarePluginResponse = {
  data: ApiCloudflarePlugin;
};

export type CloudflarePlugin = {
  id: string;
  installed: boolean;
  enabled: boolean;
  accountStatus: "connected" | "disconnected" | "error";
  accountId: string;
  accountName: string;
  authMethod: "manual" | "oauth";
  oauthAvailable: boolean;
  oauthClientIdSet: boolean;
  oauthClientSecretSet: boolean;
  oauthClientId: string;
  apiTokenSet: boolean;
  apiTokenHint: string;
  mediaStorage: "local" | "r2";
  r2Status: "connected" | "disconnected" | "error";
  r2Bucket: string;
  r2AccessKeySet: boolean;
  r2PublicBaseUrl: string;
  imagesStatus: "connected" | "disconnected" | "error";
  imagesAccountHash: string;
  imagesApiTokenSet: boolean;
  imagesApiTokenHint: string;
  verifiedAt: string | null;
};

export type UpdateCloudflarePluginInput = {
  enabled?: boolean;
  accountId?: string;
  apiToken?: string;
  oauthClientId?: string;
  oauthClientSecret?: string;
  mediaStorage?: "local" | "r2";
  r2Bucket?: string;
  r2AccessKeyId?: string;
  r2SecretAccessKey?: string;
  r2PublicBaseUrl?: string;
  imagesAccountHash?: string;
  imagesApiToken?: string;
  verifyAccount?: boolean;
  verifyR2?: boolean;
  verifyImages?: boolean;
};

export function apiCloudflarePluginToPlugin(row: ApiCloudflarePlugin): CloudflarePlugin {
  return {
    id: row.id,
    installed: row.installed,
    enabled: row.enabled,
    accountStatus: row.account_status as CloudflarePlugin["accountStatus"],
    accountId: row.account_id,
    accountName: row.account_name,
    authMethod: row.auth_method,
    oauthAvailable: row.oauth_available,
    oauthClientIdSet: Boolean(row.oauth_client_id_set),
    oauthClientSecretSet: Boolean(row.oauth_client_secret_set),
    oauthClientId: row.oauth_client_id ?? "",
    apiTokenSet: row.api_token_set,
    apiTokenHint: row.api_token_hint,
    mediaStorage: row.media_storage,
    r2Status: row.r2_status as CloudflarePlugin["r2Status"],
    r2Bucket: row.r2_bucket,
    r2AccessKeySet: row.r2_access_key_set,
    r2PublicBaseUrl: row.r2_public_base_url,
    imagesStatus: row.images_status as CloudflarePlugin["imagesStatus"],
    imagesAccountHash: row.images_account_hash,
    imagesApiTokenSet: row.images_api_token_set,
    imagesApiTokenHint: row.images_api_token_hint,
    verifiedAt: row.verified_at,
  };
}

export function cloudflarePluginUpdateToApiPayload(input: UpdateCloudflarePluginInput) {
  return {
    enabled: input.enabled,
    account_id: input.accountId,
    api_token: input.apiToken,
    oauth_client_id: input.oauthClientId,
    oauth_client_secret: input.oauthClientSecret,
    media_storage: input.mediaStorage,
    r2_bucket: input.r2Bucket,
    r2_access_key_id: input.r2AccessKeyId,
    r2_secret_access_key: input.r2SecretAccessKey,
    r2_public_base_url: input.r2PublicBaseUrl,
    images_account_hash: input.imagesAccountHash,
    images_api_token: input.imagesApiToken,
    verify_account: input.verifyAccount ?? false,
    verify_r2: input.verifyR2 ?? false,
    verify_images: input.verifyImages ?? false,
  };
}
