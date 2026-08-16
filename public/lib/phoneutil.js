/**
 * PhoneUtil – German phone number classifier & WhatsApp link generator
 * Zero dependencies – uses German mobile prefix rules (015x/016x/017x)
 */
(function() {
  'use strict';

  const WHATSAPP_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';

  // German mobile prefixes – deterministic, no library needed
  const DE_MOBILE_PREFIXES = [
    '0150','0151','0152','0153','0155','0156','0157','0158','0159',
    '0160','0161','0162','0163','0164','0165','0166','0167','0168','0169',
    '0170','0171','0172','0173','0174','0175','0176','0177','0178','0179'
  ];

  /**
   * Clean and normalize a raw phone string for comparison
   */
  function cleanNumber(raw) {
    if (!raw) return '';
    return raw.replace(/[\s\-\/\(\)\.\u00A0\u200B]/g, '').replace(/^tel:/i, '');
  }

  /**
   * Convert to E.164 format (digits only, no +) for wa.me links
   */
  function toE164Digits(raw) {
    let cleaned = cleanNumber(raw);
    if (cleaned.startsWith('+')) cleaned = cleaned.substring(1);
    else if (cleaned.startsWith('00')) cleaned = cleaned.substring(2);
    else if (cleaned.startsWith('0')) cleaned = '49' + cleaned.substring(1);
    return cleaned.replace(/\D/g, '');
  }

  /**
   * Check if a German number is mobile
   */
  function isMobileNumber(raw) {
    let cleaned = cleanNumber(raw);
    // Normalize international to domestic
    if (cleaned.startsWith('+49')) cleaned = '0' + cleaned.substring(3);
    else if (cleaned.startsWith('0049')) cleaned = '0' + cleaned.substring(4);
    
    return DE_MOBILE_PREFIXES.some(prefix => cleaned.startsWith(prefix));
  }

  /**
   * Classify a phone number
   */
  function classify(rawNumber) {
    if (!rawNumber) return { type: 'unknown', e164: '', isValid: false };
    
    const e164 = toE164Digits(rawNumber);
    const digitsOnly = e164.replace(/\D/g, '');
    const valid = digitsOnly.length >= 7;

    if (!valid) return { type: 'unknown', e164: e164, isValid: false };

    return {
      type: isMobileNumber(rawNumber) ? 'mobile' : 'fixed_line',
      e164: e164,
      isValid: true
    };
  }

  /**
   * Get wa.me URL
   */
  function getWhatsAppUrl(rawNumber) {
    const info = classify(rawNumber);
    if (!info.e164 || !info.isValid) return '';
    return 'https://wa.me/' + info.e164;
  }

  /**
   * Get the phone type emoji
   */
  function getTypeBadge(rawNumber) {
    const info = classify(rawNumber);
    if (info.type === 'mobile') return '📱';
    if (info.type === 'fixed_line') return '☎️';
    return '📞';
  }

  /**
   * Render clickable WhatsApp icon (returns HTML string)
   */
  function renderWhatsAppIcon(rawNumber) {
    if (!rawNumber) return '';
    const url = getWhatsAppUrl(rawNumber);
    if (!url) return '';
    return '<a href="' + url + '" target="_blank" rel="noopener" class="wa-icon" title="WhatsApp \u00f6ffnen" onclick="event.stopPropagation();">' + WHATSAPP_SVG + '</a>';
  }

  window.PhoneUtil = {
    classify: classify,
    getWhatsAppUrl: getWhatsAppUrl,
    getTypeBadge: getTypeBadge,
    renderWhatsAppIcon: renderWhatsAppIcon,
    WHATSAPP_SVG: WHATSAPP_SVG
  };

})();
