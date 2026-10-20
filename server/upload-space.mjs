const MiB = 1024 * 1024;

export function uploadSpaceError(available, reserved, size, reserveMiB) {
  const required = reserved + size + reserveMiB * MiB;
  if (available >= required) return null;
  const show = bytes => (bytes / MiB).toFixed(2) + ' MiB';
  return 'Not enough free server storage for this upload. ' +
    `Disk available: ${show(available)}; this file: ${show(size)}; ` +
    `reserved for unfinished uploads: ${show(reserved)}; safety reserve: ${reserveMiB} MiB. ` +
    `Additional space needed: ${show(required - available)}. ` +
    'This check covers the server filesystem, not just the media library. ' +
    'Ask the administrator to check disk usage, or complete/cancel unfinished uploads. ' +
    'Do not delete referenced media or assume backup-page files are unused.';
}
