const ZENDESK_API_BASEURL = () => process.env.ZENDESK_API_BASEURL;
const ZENDESK_API_KEY = () => process.env.ZENDESK_API_KEY;
const ENABLE_DEBUG = () => process.env.ENABLE_DEBUG;
const AZURE_TENANT_ID = () => process.env.AZURE_TENANT_ID;
const AZURE_CLIENT_ID = () => process.env.AZURE_CLIENT_ID;
const AZURE_CLIENT_SECRET = () => process.env.AZURE_CLIENT_SECRET;
const CRM_URL = () => process.env.CRM_URL;
const BACKOFF_BASE_MS = () => process.env.BACKOFF_BASE_MS || '1000';
const BACKOFF_CAP_MS = () => process.env.BACKOFF_CAP_MS || '60000';
const ALLOWED_USER_NAMES = () => process.env.ALLOWED_USER_NAMES;

export default {
  ZENDESK_API_BASEURL,
  ZENDESK_API_KEY,
  ENABLE_DEBUG,
  AZURE_TENANT_ID,
  AZURE_CLIENT_ID,
  AZURE_CLIENT_SECRET,
  CRM_URL,
  BACKOFF_BASE_MS,
  BACKOFF_CAP_MS,
  ALLOWED_USER_NAMES
};
