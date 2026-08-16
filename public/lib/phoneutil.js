/**
 * PhoneUtil – German phone number classifier & WhatsApp link generator
 * Uses libphonenumber-js (loaded via CDN) with regex fallback
 */
(function() {
  'use strict';

  const WHATSAPP_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style="vertical-align: middle;"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';

  /**
   * Normalize a raw phone string to E.164-ish format for DE
   */
  function normalizeToE164(raw) {
    if (!raw) return '';
    let cleaned = raw.replace(/[\s\-\/\(\)\.\u00A0]/g, '');
    if (cleaned.startsWith('00')) cleaned = '+' + cleaned.substring(2);
    else if (cleaned.startsWith('0')) cleaned = '+49' + cleaned.substring(1);
    else if (!cleaned.startsWith('+')) cleaned = '+49' + cleaned;
    return cleaned;
  }

  /**
   * Classify a phone number as mobile or fixed_line
   * @param {string} rawNumber - Raw phone number string
   * @returns {{ type: 'mobile'|'fixed_line'|'unknown', e164: string, isValid: boolean }}
   */
  function classify(rawNumber) {
    if (!rawNumber) return { type: 'unknown', e164: '', isValid: false };

    const e164 = normalizeToE164(rawNumber);

    // Try libphonenumber-js if loaded
    if (typeof libphonenumber !== 'undefined' && libphonenumber.parsePhoneNumber) {
      try {
        const parsed = libphonenumber.parsePhoneNumber(e164, 'DE');
        if (parsed && parsed.isValid()) {
          const t = parsed.getType();
          let phoneType = 'unknown';
          if (t === 'MOBILE') phoneType = 'mobile';
          else if (t === 'FIXED_LINE' || t === 'FIXED_LINE_OR_MOBILE' || t === 'VOIP') phoneType = 'fixed_line';
          else if (t) phoneType = 'fixed_line';
          return { type: phoneType, e164: parsed.number.replace('+', ''), isValid: true };
        }
      } catch (e) { /* fall through to regex */ }
    }

    // Regex fallback: German mobile prefixes
    const mobileRegex = /^\+49(15[0-9]|16[0-9]|17[0-9])/;
    const isMobile = mobileRegex.test(e164);
    const digitsOnly = e164.replace(/\D/g, '');

    return {
      type: isMobile ? 'mobile' : (digitsOnly.length >= 7 ? 'fixed_line' : 'unknown'),
      e164: digitsOnly,
      isValid: digitsOnly.length >= 10
    };
  }

  /**
   * Get wa.me URL for a phone number
   */
  function getWhatsAppUrl(rawNumber) {
    const info = classify(rawNumber);
    if (!info.e164) return '';
    return 'https://wa.me/' + info.e164;
  }

  /**
   * Get the phone type emoji badge
   */
  function getTypeBadge(rawNumber) {
    const info = classify(rawNumber);
    if (info.type === 'mobile') return '📱';
    if (info.type === 'fixed_line') return '☎️';
    return '📞';
  }

  /**
   * Render inline WhatsApp icon link (returns HTML string)
   */
  function renderWhatsAppIcon(rawNumber) {
    if (!rawNumber) return '';
    const url = getWhatsAppUrl(rawNumber);
    if (!url) return '';
    return `<a href="${url}" target="_blank" rel="noopener" class="wa-icon" title="WhatsApp öffnen" onclick="event.stopPropagation();">${WHATSAPP_SVG}</a>`;
  }

  // Expose globally
  window.PhoneUtil = {
    classify,
    getWhatsAppUrl,
    getTypeBadge,
    renderWhatsAppIcon,
    WHATSAPP_SVG
  };

})();
