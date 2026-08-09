/** Maximum length of the whole address (RFC 5321 path limit, minus the angle brackets). */
const MAX_ADDRESS_LENGTH = 254;

/** Maximum length of the local part (RFC 5321 §4.5.3.1.1). */
const MAX_LOCAL_LENGTH = 64;

/** Maximum length of the domain part (RFC 5321 §4.5.3.1.2). */
const MAX_DOMAIN_LENGTH = 255;

/** Maximum length of a single DNS label. */
const MAX_LABEL_LENGTH = 63;

/** `atext` as defined by RFC 5322 §3.2.3. */
const ATEXT = "[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]";

/** `dot-atom-text`: one or more `atext` runs separated by single dots. */
const DOT_ATOM_LOCAL = new RegExp(`^${ATEXT}+(?:\\.${ATEXT}+)*$`);

/** `quoted-string`: printable ASCII, `\` and `"` only when backslash-escaped. */
const QUOTED_LOCAL = /^"(?:[\x20\x21\x23-\x5B\x5D-\x7E]|\\[\x20-\x7E])*"$/;

/** A DNS label: alphanumeric edges, hyphens allowed only in the middle. */
const DOMAIN_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;

/** Top level domain: letters only, at least two of them. */
const TLD = /^[A-Za-z]{2,}$/;

/** Dotted-quad IPv4, no leading zeros. */
const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

/** A single IPv6 group. */
const IPV6_GROUP = /^[0-9A-Fa-f]{1,4}$/;

/**
 * Validates an IPv6 address, with support for `::` compression and a trailing
 * IPv4 mapped suffix (`::ffff:192.168.0.1`).
 *
 * @param address - Address without the `IPv6:` prefix
 * @returns `true` when the address is a well formed IPv6 address
 */
function isIpv6(address: string): boolean {
  const sections = address.split('::');
  if (sections.length > 2) return false;

  const compressed = sections.length === 2;
  const head = sections[0] ? sections[0].split(':') : [];
  const tail = compressed && sections[1] ? sections[1].split(':') : [];
  const groups = [...head, ...tail];

  let groupCount = groups.length;
  const last = groups[groups.length - 1];
  if (last !== undefined && last.includes('.')) {
    if (!IPV4.test(last)) return false;
    groups.pop();
    // An embedded IPv4 address occupies two 16 bit groups.
    groupCount += 1;
  }

  if (!groups.every((group) => IPV6_GROUP.test(group))) return false;

  return compressed ? groupCount <= 7 : groupCount === 8;
}

/**
 * Validates the domain part: either a dot separated DNS name or a bracketed
 * address literal (`[192.168.0.1]` / `[IPv6:::1]`).
 *
 * @param domain - Domain part of the address, without the `@`
 * @returns `true` when the domain is well formed
 */
function isValidDomain(domain: string): boolean {
  if (domain.startsWith('[') && domain.endsWith(']')) {
    const literal = domain.slice(1, -1);
    if (IPV4.test(literal)) return true;
    if (/^IPv6:/i.test(literal)) return isIpv6(literal.slice(5));
    return false;
  }

  if (domain.length > MAX_DOMAIN_LENGTH) return false;

  const labels = domain.split('.');
  if (labels.length < 2) return false;

  const labelsAreValid = labels.every(
    (label) => label.length > 0 && label.length <= MAX_LABEL_LENGTH && DOMAIN_LABEL.test(label)
  );
  if (!labelsAreValid) return false;

  return TLD.test(labels[labels.length - 1]);
}

/**
 * Splits an address into local and domain parts, honouring `@` inside a quoted
 * local part.
 *
 * @param value - Full address
 * @returns The two parts, or `null` when no usable `@` separator exists
 */
function splitAddress(value: string): { local: string; domain: string } | null {
  if (value.startsWith('"')) {
    let escaped = false;
    for (let index = 1; index < value.length; index += 1) {
      const char = value[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        if (value[index + 1] !== '@') return null;
        return { local: value.slice(0, index + 1), domain: value.slice(index + 2) };
      }
    }
    return null;
  }

  const separator = value.lastIndexOf('@');
  if (separator <= 0) return null;

  return { local: value.slice(0, separator), domain: value.slice(separator + 1) };
}

/**
 * Checks whether a value is a well formed email address.
 *
 * Stricter than the historical `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` shape: it enforces
 * the RFC length limits and rejects the single character TLDs that the old
 * regex accepted (`a@b.c`).
 *
 * Accepts:
 * - dot-atom local parts with the RFC 5322 `atext` specials (`user.name+tag@example.com`);
 * - quoted local parts, including spaces and escaped characters (`"john doe"@example.com`);
 * - address literals, IPv4 and IPv6 (`user@[192.168.0.1]`, `user@[IPv6:::1]`);
 * - internationalised (non ASCII) domains are **not** accepted — punycode them first.
 *
 * Rejects:
 * - anything that is not a `string` (never throws, always returns a boolean);
 * - addresses longer than 254 characters, or with a local part longer than 64;
 * - consecutive dots, and a leading or trailing dot in the local part or in the domain;
 * - domains without a dot, with a label longer than 63 characters, with a label
 *   starting or ending in `-`, or whose TLD is shorter than two characters or
 *   contains digits;
 * - surrounding whitespace — the value is validated as-is, it is never trimmed.
 *
 * @param value - Value to validate, of any type
 * @returns `true` when the value is a valid email address, `false` otherwise
 *
 * @example
 * ```typescript
 * isEmail('user.name+tag@example.com'); // true
 * isEmail('"john doe"@example.com');    // true
 * isEmail('user@[192.168.0.1]');        // true
 * ```
 *
 * @example
 * ```typescript
 * isEmail('a@b.c');          // false — single character TLD
 * isEmail('user@example');   // false — no dot in the domain
 * isEmail('.user@mail.com'); // false — leading dot in the local part
 * isEmail(null);             // false — non-string input never throws
 * ```
 */
export function isEmail(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (value.length === 0 || value.length > MAX_ADDRESS_LENGTH) return false;

  const parts = splitAddress(value);
  if (!parts) return false;

  const { local, domain } = parts;
  if (local.length === 0 || local.length > MAX_LOCAL_LENGTH) return false;
  if (domain.length === 0) return false;

  const localIsValid = local.startsWith('"')
    ? QUOTED_LOCAL.test(local)
    : DOT_ATOM_LOCAL.test(local);
  if (!localIsValid) return false;

  return isValidDomain(domain);
}
