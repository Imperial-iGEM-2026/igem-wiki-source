import { safeLink } from './link-url';
import { safeMediaURL } from './canvas-schema';
import { defaultLoading, validLoading } from './site-loading';
export const HEADER_FIELD = 'site:header';
export type HeaderLink = {
  label: string;
  href: string;
  group: string;
  hidden: boolean;
};
export const headerPath = (value: unknown): value is string => safeLink(value);
export type HeaderDesign = {
  loading: typeof defaultLoading;
  name: string;
  logo: string;
  background: string;
  color: string;
  height: number;
  logoSize: number;
  fontSize: number;
  navigation: boolean;
  links: HeaderLink[] | null;
  showLogo: boolean;
  showName: boolean;
  logoAlt: string;
  brandHref: string;
  fontFamily: string;
  navSize: number;
  navGap: number;
  paddingX: number;
  paddingY: number;
  borderWidth: number;
  borderColor: string;
  layout: 'split' | 'centered' | 'reversed';
};
export const defaultHeader: HeaderDesign = {
  loading: defaultLoading,
  name: '',
  logo: '',
  background: '#ffffff',
  color: '#222b25',
  height: 84,
  logoSize: 32,
  fontSize: 22,
  navigation: true,
  links: null,
  showLogo: true,
  showName: true,
  logoAlt: 'Team logo',
  brandHref: '/',
  fontFamily: 'Arial, Helvetica, sans-serif',
  navSize: 14,
  navGap: 24,
  paddingX: 5,
  paddingY: 16,
  borderWidth: 1,
  borderColor: '#e2e6df',
  layout: 'split',
};
export function parseHeader(value = '{}'): HeaderDesign {
  try {
    const data = JSON.parse(value);
    if (!validHeader(data)) return defaultHeader;
    return { ...defaultHeader, ...data, loading: { ...defaultLoading, ...data.loading } };
  } catch {
    return defaultHeader;
  }
}
export function validHeader(data: unknown): data is Partial<HeaderDesign> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const d = data as Partial<HeaderDesign>;
  return (
    (d.loading === undefined || validLoading(d.loading)) &&
    Object.keys(d).every((k) => Object.hasOwn(defaultHeader, k)) &&
    (d.name === undefined ||
      (typeof d.name === 'string' && d.name.length <= 100)) &&
    (d.logo === undefined ||
      (typeof d.logo === 'string' &&
        d.logo.length <= 2048 &&
        (!d.logo || safeMediaURL(d.logo)))) &&
    ['background', 'color', 'borderColor'].every(
      (k) =>
        d[k as 'color'] === undefined ||
        /^#[a-fA-F0-9]{6}$/.test(d[k as 'color']!),
    ) &&
    [
      ['height', 48, 180],
      ['logoSize', 16, 100],
      ['fontSize', 12, 48],
      ['navSize', 10, 32],
      ['navGap', 0, 80],
      ['paddingX', 0, 15],
      ['paddingY', 0, 64],
      ['borderWidth', 0, 8],
    ].every(([key, min, max]) => {
      const v = d[key as 'height'];
      return (
        v === undefined ||
        (typeof v === 'number' &&
          Number.isFinite(v) &&
          v >= Number(min) &&
          v <= Number(max))
      );
    }) &&
    ['navigation', 'showLogo', 'showName'].every(
      (k) =>
        d[k as 'navigation'] === undefined ||
        typeof d[k as 'navigation'] === 'boolean',
    ) &&
    (d.logoAlt === undefined ||
      (typeof d.logoAlt === 'string' && d.logoAlt.length <= 200)) &&
    (d.brandHref === undefined || headerPath(d.brandHref)) &&
    (d.fontFamily === undefined ||
      (typeof d.fontFamily === 'string' &&
        /^[a-zA-Z0-9 ,"'-]{1,200}$/.test(d.fontFamily))) &&
    (d.layout === undefined ||
      ['split', 'centered', 'reversed'].includes(d.layout)) &&
    (d.links === undefined ||
      d.links === null ||
      (Array.isArray(d.links) &&
        d.links.length <= 100 &&
        d.links.every(
          (link) =>
            link &&
            typeof link === 'object' &&
            Object.keys(link).every((k) =>
              ['label', 'href', 'group', 'hidden'].includes(k),
            ) &&
            typeof link.label === 'string' &&
            link.label.length <= 80 &&
            headerPath(link.href) &&
            typeof link.group === 'string' &&
            link.group.length <= 60 &&
            typeof link.hidden === 'boolean',
        )))
  );
}
