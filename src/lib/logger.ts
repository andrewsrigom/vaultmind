type LogContext = Record<string, unknown>;

type SerializedError = {
  code?: string;
  fingerprint: string;
  message: string;
  name: string;
  status?: number;
};

export type SafeLogErrorInput = {
  code: string;
  message: string;
  name?: string | undefined;
  status?: number | undefined;
};

const invalidLogDate = '[invalid-date]';
const maxLogContextEntries = 100;
const redactedErrorMessage = 'Error details redacted.';
const redactedLogValue = '[redacted]';
const safeLogContextIdentifierKeys = new Set([
  'channel',
  'eventtype',
  'feature',
  'kind',
  'method',
  'mode',
  'model',
  'notificationstatus',
  'operation',
  'permission',
  'phase',
  'plankey',
  'provider',
  'reason',
  'rolekey',
  'sourcetype',
  'status',
  'templatekey',
  'trigger',
  'type',
]);
const safeLogContextNumericKeys = new Set([
  'attempt',
  'durationms',
  'limit',
  'offset',
  'page',
  'recipientcount',
  'sizebytes',
]);
const safeOperationalErrorCodes = new Set([
  'ABORT_ERR',
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
]);
const safeLogErrorNamePattern = /^(?:Error|[A-Za-z][A-Za-z0-9]{0,62}Error)$/u;
const safeLogIdentifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const safeLogMimeTypePattern =
  /^[A-Za-z0-9][A-Za-z0-9.+-]{0,63}\/[A-Za-z0-9][A-Za-z0-9.+-]{0,63}$/u;
const safeLogTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const safeOperationalCodeTermPattern =
  /(?:^|[-_.])(?:conflict|denied|error|expired|failed|failure|forbidden|invalid|mismatch|missing|required|timeout|unauthorized|unavailable|unsupported)(?:$|[-_.])|(?:^|[-_.])not[-_.]found(?:$|[-_.])/u;
const sensitiveLogIdentifierFragmentPattern = /(?:bearer|password|secret|token)/iu;
const sqlStateCodePattern = /^(?=.*[0-9])[0-9A-Z]{5}$/u;

function normalizeLogIdentifier(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalizedValue = value.trim();

  return safeLogIdentifierPattern.test(normalizedValue) &&
    !sensitiveLogIdentifierFragmentPattern.test(normalizedValue)
    ? normalizedValue
    : undefined;
}

function normalizeLogErrorName(value: unknown): string | undefined {
  const normalizedName = normalizeLogIdentifier(value);

  return normalizedName && safeLogErrorNamePattern.test(normalizedName)
    ? normalizedName
    : undefined;
}

function normalizeLogContextKey(key: string): string {
  return key.replaceAll(/[^A-Za-z0-9]/gu, '').toLowerCase();
}

function normalizeSafeOperationalCode(value: unknown): string | undefined {
  const normalizedCode = normalizeLogIdentifier(value);

  if (!normalizedCode) {
    return undefined;
  }

  const uppercaseCode = normalizedCode.toUpperCase();

  if (safeOperationalErrorCodes.has(uppercaseCode) || sqlStateCodePattern.test(uppercaseCode)) {
    return uppercaseCode;
  }

  return safeOperationalCodeTermPattern.test(normalizedCode.toLowerCase())
    ? normalizedCode
    : undefined;
}

function readObjectProperty(value: object, key: string): unknown {
  try {
    return (value as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

function getErrorName(error: object): string {
  const explicitName = normalizeLogErrorName(readObjectProperty(error, 'name'));
  const constructorValue = readObjectProperty(error, 'constructor');
  const constructorName =
    typeof constructorValue === 'function'
      ? normalizeLogErrorName(readObjectProperty(constructorValue, 'name'))
      : undefined;

  if (explicitName === 'Error' && constructorName && constructorName !== 'Error') {
    return constructorName;
  }

  if (explicitName) {
    return explicitName;
  }

  if (constructorName) {
    return constructorName;
  }

  return error instanceof Error ? 'Error' : 'UnknownError';
}

function getErrorStatus(error: object): number | undefined {
  const status = readObjectProperty(error, 'status');
  const statusCode = readObjectProperty(error, 'statusCode');
  const candidate = typeof status === 'number' ? status : statusCode;

  return typeof candidate === 'number' &&
    Number.isInteger(candidate) &&
    candidate >= 100 &&
    candidate <= 599
    ? candidate
    : undefined;
}

function getErrorCodeCandidate(error: object): string | undefined {
  return normalizeLogIdentifier(readObjectProperty(error, 'code'));
}

function createStableLogFingerprint(value: string): string {
  let hash = 2_166_136_261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return `err-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function createErrorFingerprint({
  code,
  error,
  name,
  status,
}: {
  code: string | undefined;
  error: unknown;
  name: string;
  status: number | undefined;
}): string {
  const identity = [name, code ?? 'no-code', status?.toString() ?? 'no-status'];

  if (error && typeof error === 'object') {
    const cause = readObjectProperty(error, 'cause');

    if (cause && typeof cause === 'object') {
      identity.push(
        getErrorName(cause),
        getErrorCodeCandidate(cause) ?? 'no-cause-code',
        getErrorStatus(cause)?.toString() ?? 'no-cause-status',
      );
    }
  } else {
    identity.push(typeof error);
  }

  return createStableLogFingerprint(identity.join('|'));
}

export class SafeLogError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor({ code, message, name = 'SafeLogError', status }: SafeLogErrorInput) {
    super(message);
    this.code = code;
    this.name = name;

    if (status !== undefined) {
      this.status = status;
    }
  }
}

function serializeError(error: unknown): SerializedError {
  if (error instanceof SafeLogError) {
    const code = normalizeSafeOperationalCode(error.code) ?? 'internal-error';
    const name = getErrorName(error);
    const status = getErrorStatus(error);
    const serializedError: SerializedError = {
      code,
      fingerprint: createErrorFingerprint({ code, error, name, status }),
      message: error.message,
      name,
    };

    if (status !== undefined) {
      serializedError.status = status;
    }

    return serializedError;
  }

  if (error && typeof error === 'object') {
    const codeCandidate = getErrorCodeCandidate(error);
    const code = normalizeSafeOperationalCode(codeCandidate);
    const name = getErrorName(error);
    const status = getErrorStatus(error);
    const serializedError: SerializedError = {
      fingerprint: createErrorFingerprint({ code: codeCandidate, error, name, status }),
      message: redactedErrorMessage,
      name,
    };

    if (code !== undefined) {
      serializedError.code = code;
    }

    if (status !== undefined) {
      serializedError.status = status;
    }

    return serializedError;
  }

  const name = 'UnknownError';

  return {
    fingerprint: createErrorFingerprint({ code: undefined, error, name, status: undefined }),
    message: redactedErrorMessage,
    name,
  };
}

function isLogIdentifierKey(key: string): boolean {
  return key === 'id' || key === 'ids' || /(?:Id|IDs?)$/u.test(key);
}

function isLogTimestampKey(key: string): boolean {
  return key === 'timestamp' || /At$/u.test(key);
}

function isAllowlistedLogContextKey(key: string): boolean {
  const normalizedKey = normalizeLogContextKey(key);

  if (normalizedKey === 'redactedfieldcount') {
    return false;
  }

  return (
    normalizedKey === 'code' ||
    normalizedKey === 'error' ||
    normalizedKey === 'errorname' ||
    normalizedKey === 'mimetype' ||
    isLogIdentifierKey(key) ||
    isLogTimestampKey(key) ||
    safeLogContextIdentifierKeys.has(normalizedKey) ||
    safeLogContextNumericKeys.has(normalizedKey) ||
    normalizedKey.endsWith('count')
  );
}

function sanitizeSingleLogIdentifier(value: unknown): string | number {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return value;
  }

  return normalizeLogIdentifier(value) ?? redactedLogValue;
}

function sanitizeLogIdentifierValue(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return sanitizeSingleLogIdentifier(value);
  }

  const sanitizedValues: Array<string | number> = value
    .slice(0, maxLogContextEntries)
    .map(sanitizeSingleLogIdentifier);

  if (value.length > maxLogContextEntries) {
    sanitizedValues.push('[truncated]');
  }

  return sanitizedValues;
}

function sanitizeLogDate(value: unknown): string {
  if (value instanceof Date) {
    try {
      return Number.isFinite(Date.prototype.getTime.call(value))
        ? Date.prototype.toISOString.call(value)
        : invalidLogDate;
    } catch {
      return invalidLogDate;
    }
  }

  if (
    typeof value === 'string' &&
    safeLogTimestampPattern.test(value) &&
    Number.isFinite(Date.parse(value))
  ) {
    return value;
  }

  return redactedLogValue;
}

function sanitizeLogContextEntry(key: string, value: unknown): unknown {
  const normalizedKey = normalizeLogContextKey(key);

  if (normalizedKey === 'error') {
    return serializeError(value);
  }

  if (isLogIdentifierKey(key)) {
    return sanitizeLogIdentifierValue(value);
  }

  if (normalizedKey === 'code') {
    return normalizeSafeOperationalCode(value) ?? redactedLogValue;
  }

  if (normalizedKey === 'errorname') {
    return normalizeLogErrorName(value) ?? redactedLogValue;
  }

  if (normalizedKey === 'mimetype') {
    return typeof value === 'string' && safeLogMimeTypePattern.test(value)
      ? value
      : redactedLogValue;
  }

  if (safeLogContextNumericKeys.has(normalizedKey) || normalizedKey.endsWith('count')) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
      ? value
      : redactedLogValue;
  }

  if (isLogTimestampKey(key)) {
    return sanitizeLogDate(value);
  }

  if (safeLogContextIdentifierKeys.has(normalizedKey)) {
    if (normalizedKey === 'status' && typeof value === 'number') {
      return Number.isInteger(value) && value >= 100 && value <= 599 ? value : redactedLogValue;
    }

    return normalizeLogIdentifier(value) ?? redactedLogValue;
  }

  return redactedLogValue;
}

function sanitizeLogContext(context: LogContext | undefined): LogContext | undefined {
  if (!context) {
    return undefined;
  }

  let keys: string[];

  try {
    keys = Object.keys(context);
  } catch {
    return { unavailable: true };
  }

  const sanitizedContext: LogContext = {};
  let redactedFieldCount = 0;

  for (const key of keys.slice(0, maxLogContextEntries)) {
    if (!isAllowlistedLogContextKey(key)) {
      redactedFieldCount += 1;
      continue;
    }

    try {
      sanitizedContext[key] = sanitizeLogContextEntry(key, context[key]);
    } catch {
      sanitizedContext[key] = '[unavailable]';
    }
  }

  if (redactedFieldCount > 0) {
    sanitizedContext.redactedFieldCount = redactedFieldCount;
  }

  if (keys.length > maxLogContextEntries) {
    sanitizedContext.truncated = true;
  }

  return sanitizedContext;
}

export function createLogger(name: string) {
  return {
    error(message: string, error?: unknown, context?: LogContext) {
      console.error(
        JSON.stringify({
          context: sanitizeLogContext(context),
          error: serializeError(error),
          level: 'error',
          message,
          name,
        }),
      );
    },
    info(message: string, context?: LogContext) {
      console.info(
        JSON.stringify({ context: sanitizeLogContext(context), level: 'info', message, name }),
      );
    },
    warn(message: string, context?: LogContext) {
      console.warn(
        JSON.stringify({ context: sanitizeLogContext(context), level: 'warn', message, name }),
      );
    },
  };
}
