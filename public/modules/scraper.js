(function() {
  let scoutedResults = [];
  let scoutMarkers = [];

  window.loadApiKey = () => {
    const inp = document.getElementById('google-api-key');
    let key = localStorage.getItem('googlePlacesApiKey');
    if (!key && inp && inp.value) {
      key = inp.value;
      localStorage.setItem('googlePlacesApiKey', key);
    }
    if (inp && key) inp.value = key;
    return key || '';
  };

  window.saveApiKey = (val) => {
    localStorage.setItem('googlePlacesApiKey', val.trim());
  };

  // Helper to escape HTML tags to prevent XSS injection
  const escapeHtml = (unsafe) => {
    return (unsafe || '').toString()
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
  };

  // Extract phone numbers from website HTML content using regular expressions
  function extractPhoneFromHtml(html) {
    if (!html) return null;
    
    // Step 1: Prioritize explicit tel: links
    const telMatch = html.match(/href=["']tel:([^"'\s>]+)["']/i);
    if (telMatch && telMatch[1]) {
      return decodeURIComponent(telMatch[1]).replace(/%20/g, ' ').trim();
    }
    
    // Step 2: Regex-based pattern matching for text phone numbers
    // Captures +49..., 0049..., or standard 0... numbers with spaces, slashes, or dashes
    const phoneRegex = /(?:\+49|0049|[0\+])[1-9][0-9]{1,4}[/\-\s\d]{5,15}/g;
    const matches = html.match(phoneRegex);
    if (matches && matches.length > 0) {
      for (let match of matches) {
        const clean = match.replace(/[^0-9]/g, '');
        // Verify length corresponds to a valid German/intl number (typically 7-15 digits)
        if (clean.length >= 7 && clean.length <= 15) {
          return match.trim();
        }
      }
    }
    return null;
  }

  // Find legal/contact links within main page HTML
  function findSubpageLink(html, baseUrl) {
    const linkRegex = /href=["']([^"']*(?:impressum|contact|kontakt|about|ueber-uns|legal)[^"']*)["']/i;
    const match = html.match(linkRegex);
    if (match && match[1]) {
      let sub = match[1].trim();
      if (/^https?:\/\//i.test(sub)) {
        return sub;
      }
      try {
        const parsedBase = new URL(baseUrl);
        if (sub.startsWith('/')) {
          return parsedBase.origin + sub;
        } else {
          const pathname = parsedBase.pathname;
          const lastSlash = pathname.lastIndexOf('/');
          const basePath = lastSlash !== -1 ? pathname.substring(0, lastSlash + 1) : '/';
          return parsedBase.origin + basePath + sub;
        }
      } catch (err) {
        return null;
      }
    }
    return null;
  }

  // Formatting extracted raw number
  function cleanPhoneNumber(num) {
    let clean = num.trim().replace(/[\r\n\t]/g, '');
    clean = clean.replace(/^(?:tel:)/i, '');
    return clean;
  }

  function extractEmailFromHtml(html) {
    if (!html) return null;
    const match = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    return match ? match[0] : null;
  }

  function extractImpressumData(html) {
    if (!html) return { legal_company_name: '', director_name: '' };
    const data = { legal_company_name: '', director_name: '' };
    const directorMatch = html.match(/(?:Geschäftsführer|Inhaber|Vertretungsberechtigt)[\s:]*([A-Za-zäöüÄÖÜß\s]+?)(?:<|\n|,)/i);
    if (directorMatch && directorMatch[1]) {
      data.director_name = directorMatch[1].trim();
    }
    const nameMatch = html.match(/(?:Firma|Name)[\s:]*([A-Za-zäöüÄÖÜß0-9\s&.-]+?(?:GmbH|UG|AG|GbR|e\.K\.|KG))/i);
    if (nameMatch && nameMatch[1]) {
      data.legal_company_name = nameMatch[1].trim();
    }
    return data;
  }

  // Core background crawler
  window.enrichLeadData = async (websiteUrl) => {
    const resData = { phone: null, email: null, impressum_phone: null, legal_company_name: '', director_name: '' };
    if (!websiteUrl) return resData;
    let url = websiteUrl.trim();
    if (!/^https?:\/\//i.test(url)) url = 'http://' + url;
    
    try {
      const res = await window.api.fetchApi(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res || !res.ok || !res.data) return resData;

      const html = res.data;
      resData.email = extractEmailFromHtml(html);
      let phone = extractPhoneFromHtml(html);
      if (phone) resData.phone = cleanPhoneNumber(phone);

      const subpageUrl = findSubpageLink(html, url);
      if (subpageUrl) {
        const subRes = await window.api.fetchApi(subpageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (subRes && subRes.ok && subRes.data) {
          const subHtml = subRes.data;
          const impPhone = extractPhoneFromHtml(subHtml);
          if (impPhone) resData.impressum_phone = cleanPhoneNumber(impPhone);
          if (!resData.email) resData.email = extractEmailFromHtml(subHtml);
          const impData = extractImpressumData(subHtml);
          resData.legal_company_name = impData.legal_company_name;
          resData.director_name = impData.director_name;
        }
      }
    } catch (e) {
      console.error(`Enrichment crawl failed for ${websiteUrl}:`, e);
    }
    return resData;
  };

  // Triggers background search for a single lead's missing phone number
  window.triggerManualEnrichment = async (index) => {
    const r = scoutedResults[index];
    if (!r || !r.website) return;

    const container = document.getElementById(`enrich-phone-container-${index}`);
    if (!container) return;

    container.innerHTML = `<span>📞</span> <span style="font-style:italic; font-size:11px; color:var(--text-muted);">Suche läuft... ⏳</span>`;

    const data = await window.enrichLeadData(r.website);
    if (data.phone || data.impressum_phone) {
      r.phone = data.phone || data.impressum_phone;
      r.email = data.email || '';
      r.legal_company_name = data.legal_company_name || '';
      r.director_name = data.director_name || '';
      r.impressum_phone = data.impressum_phone || '';
      showToast(`Daten gefunden (Tel: ${r.phone}) ⚡`);
    } else {
      showToast(`Keine Telefonnummer auf der Website gefunden.`, true);
    }
    const existingLeads = await window.api.getLeads({ all: true });
    renderScoutedCards(scoutedResults, existingLeads);
  };

  window.findDuplicateCRMLead = (r, existingLeads) => {
    const cleanUrl = (url) => url ? url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '').toLowerCase().trim() : null;
    let extLead = null;
    // 1. Google Places ID
    if (!extLead && r.google_place_id) {
      extLead = existingLeads.find(l => l.google_place_id === r.google_place_id || (l.locations && Array.isArray(l.locations) && l.locations.some(loc => loc.place_id === r.google_place_id)));
    }
    // 2. Address match (exact)
    if (!extLead && r.address) {
      const targetAddress = r.address.toLowerCase().trim();
      extLead = existingLeads.find(l => (l.maps_city && l.maps_city.toLowerCase().trim() === targetAddress) || (l.locations && Array.isArray(l.locations) && l.locations.some(loc => loc.address && loc.address.toLowerCase().trim() === targetAddress)));
    }
    // 3. Phone number match
    if (!extLead && r.phone) {
      extLead = existingLeads.find(l => l.phone === r.phone || l.impressum_phone === r.phone);
    }
    // 4. Website URL match
    if (!extLead && r.website) {
      const targetUrl = cleanUrl(r.website);
      if (targetUrl) {
        extLead = existingLeads.find(l => cleanUrl(l.website_url) === targetUrl);
      }
    }
    // 5. Name match (exact/fuzzy fallback)
    if (!extLead && r.name) {
      const targetName = r.name.toLowerCase().trim();
      extLead = existingLeads.find(l => l.name.toLowerCase().trim() === targetName);
    }
    return extLead;
  };

  // Render search results grid
  function renderScoutedCards(results, existingLeads) {
    const resCont = document.getElementById('scout-results');
    if (!resCont) return;

    // Support phone-only filtering option at render level
    const phoneOnly = document.getElementById('scout-phone-only')?.checked || false;
    let filtered = results;
    if (phoneOnly) {
      filtered = results.filter(r => r.phone);
    }

    if (filtered.length === 0) {
      resCont.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">Keine Leads gefunden. Passe deine Filter oder Suchbegriffe an.</div>`;
      return;
    }

    resCont.innerHTML = filtered.map((r) => {
      const originalIndex = scoutedResults.indexOf(r);
      // Deduplication Priority Check across ALL CRM states
      const extLead = window.findDuplicateCRMLead(r, existingLeads);
      
      const isExcluded = extLead && extLead.status === 'Uninteressant';
      const isDuplicate = extLead && !isExcluded;

      const cardClass = (isExcluded || isDuplicate) ? 'scout-card scout-card-duplicate' : 'scout-card';
      
      let badgeHtml = '';
      if (isExcluded) {
        badgeHtml = `<span class="scout-badge duplicate" style="background: rgba(255, 69, 58, 0.1); border: 1px solid rgba(255, 69, 58, 0.3); color: #ff453a;" title="Dieser Google Places Lead wurde als uninteressant markiert.">🚫 Ausgeschlossen</span>`;
      } else if (isDuplicate) {
        let ownerStr = 'Kalt';
        if (extLead.claimed_by) {
           const owner = (window.globalUsersList || []).find(u => u.id === extLead.claimed_by);
           ownerStr = owner ? owner.name : 'Zugewiesen';
        }
        const textStr = ownerStr === 'Kalt' ? '✓ Im CRM (Kalt)' : `✓ Im CRM (Gehört ${ownerStr})`;
        badgeHtml = `<span class="scout-badge duplicate" onclick="window.switchTab('queue').then(() => openLead(${extLead.id}))" style="cursor:pointer;" title="Klicke hier, um den Lead im CRM zu öffnen">${escapeHtml(textStr)}</span>`;
      } else {
        badgeHtml = `<span class="scout-badge" style="background: rgba(10, 132, 255, 0.1); border: 1px solid rgba(10, 132, 255, 0.3); color: #0a84ff;">Bereit</span>`;
      }

      let ratingHtml = '';
      if (r.rating) {
        ratingHtml = `<span class="scout-badge rating">⭐ ${r.rating} (${r.userRatingCount || 0})</span>`;
      }

      let categoryHtml = '';
      if (r.category) {
        categoryHtml = `<span class="scout-badge category">${escapeHtml(r.category)}</span>`;
      }

      let phoneHtml = '';
      if (r.phone) {
        phoneHtml = `
          <div class="scout-card-detail">
            <span>📞</span>
            <span style="font-family: monospace; font-size:12px; color: var(--text-main);">${escapeHtml(r.phone)}</span>
            <button class="copy-btn" style="padding: 2px 6px; font-size: 10px; margin-left: auto;" onclick="window.api.copyText('${escapeHtml(r.phone)}').then(() => showToast('Telefonnummer kopiert!'))">Kopieren</button>
          </div>
        `;
      } else if (r.website) {
        phoneHtml = `
          <div class="scout-card-detail" id="enrich-phone-container-${originalIndex}">
            <span>📞</span>
            <span style="font-style: italic; color: var(--text-muted); font-size: 12px;">Keine Nummer</span>
            <button class="action-btn-small outline" style="padding: 2px 8px; font-size: 10px; margin-left: auto; color: var(--accent); border-color: var(--accent);" onclick="triggerManualEnrichment(${originalIndex})">🔎 Suchen</button>
          </div>
        `;
      } else {
        phoneHtml = `
          <div class="scout-card-detail">
            <span>📞</span>
            <span style="font-style: italic; color: var(--text-muted); font-size: 12px;">Keine Nummer</span>
          </div>
        `;
      }

      const canIngest = true; // Relaxed: allow import without website, phone, or email
      let importBtnHtml = '';
      if (isExcluded) {
        importBtnHtml = `<button class="action-btn-small" style="flex:1; background:transparent; border-color:var(--border); color:var(--text-muted);" disabled>🚫 Ausgeschlossen</button>`;
      } else if (isDuplicate) {
        importBtnHtml = `<button class="action-btn-small" style="flex:1; background:transparent; border-color:var(--border); color:var(--text-muted);" disabled>✓ Im CRM</button>`;
      } else if (!canIngest) {
        importBtnHtml = `<button class="action-btn-small" style="flex:1; background:transparent; border-color:var(--border); color:var(--text-muted);" title="Import derzeit nicht möglich" disabled>⚠️ Unvollständig</button>`;
      } else {
        importBtnHtml = `<button class="action-btn-small success-bold" style="flex:1; padding: 6px; font-size: 11px;" onclick="importSingleScoutedLead(${originalIndex})">📥 Importieren</button>`;
      }

      return `
        <div class="${cardClass}" id="scout-card-${originalIndex}">
          <div class="scout-card-header">
            <div class="scout-card-title" title="${escapeHtml(r.name)}">${escapeHtml(r.name)}</div>
            ${badgeHtml}
          </div>
          
          <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom: 12px;">
            ${categoryHtml}
            ${ratingHtml}
          </div>

          <div class="scout-card-detail">
            <span>📍</span>
            <span style="font-size:12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(r.maps_city)}">${escapeHtml(r.maps_city || 'Unbekannter Ort')}</span>
          </div>

          ${phoneHtml}

          <div class="scout-card-actions">
            ${r.website ? `<button onclick="window.api.openExternal('${escapeHtml(r.website)}')" class="action-btn-small outline" style="padding:6px; font-size:11px;" title="${escapeHtml(r.website)}">🌐 Website</button>` : ''}
            ${r.google_maps_url ? `<button onclick="window.api.openExternal('${escapeHtml(r.google_maps_url)}')" class="action-btn-small outline" style="padding:6px; font-size:11px;">🗺️ Maps</button>` : ''}
            ${importBtnHtml}
          </div>
        </div>
      `;
    }).join('');
  }

  // Automatic background phone enrichment process
  async function autoEnrichMissingPhones() {
    const autoEnrichCheckbox = document.getElementById('scout-auto-enrich');
    if (!autoEnrichCheckbox || !autoEnrichCheckbox.checked) return;

    const toEnrich = scoutedResults.filter(r => r.website && !r.phone);
    if (toEnrich.length === 0) return;

    const statusText = document.getElementById('scout-status-text');
    let count = 0;
    for (let r of toEnrich) {
      if (statusText) {
        statusText.innerText = `Recherche läuft... Anreicherung von Lead ${count + 1} von ${toEnrich.length} ⚡`;
      }
      
      const data = await window.enrichLeadData(r.website);
      if (data.phone || data.impressum_phone) {
        r.phone = data.phone || data.impressum_phone;
        r.email = data.email || '';
        r.legal_company_name = data.legal_company_name || '';
        r.director_name = data.director_name || '';
        r.impressum_phone = data.impressum_phone || '';
        const existingLeads = await window.api.getLeads({ all: true });
        renderScoutedCards(scoutedResults, existingLeads);
      }
      count++;
    }

    if (statusText) {
      statusText.innerText = `Suche abgeschlossen! ${scoutedResults.length} Leads gefunden.`;
    }
  }

  // Standard scan execution
  window.startScouting = async () => {
    const term = document.getElementById('scout-term').value.trim();
    const city = document.getElementById('scout-city').value.trim();
    if (!term) return alert('Bitte mindestes einen Suchbegriff oder eine Adresse eintragen.');

    const apiKey = localStorage.getItem('googlePlacesApiKey') || '';
    const resCont = document.getElementById('scout-results');
    const statusText = document.getElementById('scout-status-text');
    const importBtn = document.getElementById('scout-import-btn');

    resCont.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">Scouting läuft... ⏳</div>`;
    if (statusText) statusText.innerText = 'Suche wird gestartet...';
    if (importBtn) importBtn.style.display = 'none';
    
    scoutedResults = [];
    
    // Capture user filters
    const maxResults = parseInt(document.getElementById('scout-max-results')?.value) || 20;
    const radiusVal = parseInt(document.getElementById('scout-radius')?.value) || 10;
    const ratingThreshold = parseFloat(document.getElementById('scout-rating-threshold')?.value) || 0;

    const existingLeads = await window.api.getLeads({ all: true });
    const existingNames = new Set(existingLeads.map(l => l.name.toLowerCase().trim()));
    const existingPhones = new Set(existingLeads.map(l => l.phone).filter(p => p));

    try {
      if (apiKey) {
        // --- GOOGLE PLACES API ---
        const url = 'https://places.googleapis.com/v1/places:searchText';
        
        let morePages = true;
        let pageCount = 0;
        let pageToken = '';
        const maxPages = Math.ceil(maxResults / 20);

        while (morePages && pageCount < maxPages) {
          let queryStr = term;
          if (city) queryStr += ` in ${city}`;
          const body = { textQuery: queryStr, pageSize: 20 };
          if (pageToken) body.pageToken = pageToken;
          
          if (statusText) statusText.innerText = `Scouting Seite ${pageCount + 1}... ⏳`;
          
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': apiKey,
              'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.location,places.googleMapsUri,places.id,places.rating,places.userRatingCount,places.primaryTypeDisplayName,places.regularOpeningHours,nextPageToken'
            },
            body: JSON.stringify(body)
          });
          const data = await res.json();
          if (data.error) throw new Error(data.error.message);

          if (data.places && data.places.length > 0) {
            data.places.forEach(item => {
               // Apply rating filter
               const rating = item.rating || 0;
               if (ratingThreshold > 0 && rating < ratingThreshold) {
                 return; // Skip below threshold
               }

               let lat = item.location?.latitude;
               let lng = item.location?.longitude;
               let name = item.displayName ? item.displayName.text : 'Unbekannt';
               let phone = item.nationalPhoneNumber || '';
               let website = item.websiteUri || '';
               let address = item.formattedAddress || city;
               let googleMapsUrl = item.googleMapsUri || '';
               let category = item.primaryTypeDisplayName?.text || '';

               // Estimate Energy Consumption
               let est_kwh = 5000;
               let catLower = (category || '').toLowerCase();
               if (catLower.includes('bäckerei') || catLower.includes('restaurant') || catLower.includes('café') || catLower.includes('hotel') || catLower.includes('gaststätten')) est_kwh = 40000;
               else if (catLower.includes('büro') || catLower.includes('agentur') || catLower.includes('anwalt')) est_kwh = 8000;
               else if (catLower.includes('produktion') || catLower.includes('werkstatt')) est_kwh = 25000;
               
               let multiplier = 1;
               let rc = item.userRatingCount || 0;
               if (rc > 200) multiplier = 3.5;
               else if (rc > 50) multiplier = 1.8;
               else if (rc > 10) multiplier = 1.2;
               est_kwh = Math.floor(est_kwh * multiplier);

               let opening_hours = null;
               if (item.regularOpeningHours && item.regularOpeningHours.weekdayDescriptions) {
                 opening_hours = item.regularOpeningHours.weekdayDescriptions;
               }

               // Cap results list
               if (scoutedResults.length < maxResults) {
                 scoutedResults.push({ 
                   name, phone, website, maps_city: address, lat, lng, 
                   google_maps_url: googleMapsUrl, google_place_id: item.id,
                   rating, userRatingCount: rc, category,
                   estimated_kwh: est_kwh, opening_hours
                 });
               }
            });
          }

          if (data.nextPageToken && scoutedResults.length < maxResults) {
             pageToken = data.nextPageToken;
             pageCount++;
             await new Promise(r => setTimeout(r, 1000));
          } else {
             morePages = false;
          }
        }
      } else {
        // --- OPENSTREETMAP NOMINATIM FALLBACK ---
        let queryStr = term;
        if (city) queryStr += `, ${city}`;
        const q = encodeURIComponent(queryStr);
        const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&addressdetails=1&extratags=1&limit=${maxResults}`;
        const res = await fetch(url, { 
          headers: { 
            'Accept-Language': 'de-DE',
            'User-Agent': 'LightningCRMMatching/1.0'
          } 
        });
        const data = await res.json();

        if (data && data.length > 0) {
          data.forEach(item => {
             let lat = parseFloat(item.lat);
             let lng = parseFloat(item.lon);
             let name = item.name || (item.display_name ? item.display_name.split(',')[0] : 'Unbekannt');
             if (!name) return;

             let phone = '';
             let website = '';
             let category = '';
             if (item.extratags) {
               phone = item.extratags.phone || item.extratags['contact:phone'] || '';
               website = item.extratags.website || item.extratags['contact:website'] || '';
               category = item.extratags.amenity || item.extratags.shop || item.extratags.craft || item.extratags.office || '';
             }
             if (!category && item.type) {
               category = item.type;
             }

             let osmMapUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
             if (scoutedResults.length < maxResults) {
               scoutedResults.push({ 
                 name, phone, website, maps_city: city || item.display_name.split(',')[1] || '', 
                 lat, lng, google_maps_url: osmMapUrl, google_place_id: '',
                 rating: 0, userRatingCount: 0, category
               });
             }
          });
        }
      }
        
      if (scoutedResults.length > 0) {
        renderScoutedCards(scoutedResults, existingLeads);
        
        if (importBtn) {
          importBtn.style.display = 'block';
          importBtn.innerText = `Alle ${scoutedResults.length} importieren 📥`;
        }
        if (statusText) statusText.innerText = `${scoutedResults.length} Leads gefunden.`;

        // Trigger automatic background crawler
        await autoEnrichMissingPhones();
      } else {
        resCont.innerHTML = `
          <div class="empty-state" style="grid-column: 1 / -1; height:auto; text-align:center;">
             Keine direkten Ergebnisse gefunden.<br><br>
             <button class="action-btn-small outline" style="border-color:var(--accent); color:var(--text-main);" onclick="runDeepSearch('${escapeHtml(term)}', '${escapeHtml(city)}')">Deep Search (Overpass API) starten</button>
          </div>
        `;
        if (statusText) statusText.innerText = 'Keine Ergebnisse.';
      }
    } catch (err) {
      resCont.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1; height:auto; color:red;">Fehler: ${err.message}</div>`;
      if (statusText) statusText.innerText = 'Fehler aufgetreten.';
    }
  };

  // Deep search fallback utilizing Overpass API
  window.runDeepSearch = async (term, city) => {
    const resCont = document.getElementById('scout-results');
    const statusText = document.getElementById('scout-status-text');
    const importBtn = document.getElementById('scout-import-btn');

    resCont.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">Starte Deep Search (Overpass)... ⏳</div>`;
    if (statusText) statusText.innerText = 'Deep Search läuft...';
    
    scoutedResults = [];
    const maxResults = parseInt(document.getElementById('scout-max-results')?.value) || 20;

    let query = `[out:json][timeout:25];`;
    if (city) {
        query += `area[name="${city}"]->.searchArea;`;
        query += `(nwr["name"~"${term}",i](area.searchArea););`;
    } else {
        query += `(nwr["name"~"${term}",i];);`;
    }
    query += `out center ${maxResults};`;

    try {
        const url = `https://overpass-api.de/api/interpreter`;
        const res = await fetch(url, {
            method: 'POST',
            body: query,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        const data = await res.json();
        
        const existingLeads = await window.api.getLeads({ all: true });

        if (data && data.elements && data.elements.length > 0) {
            data.elements.forEach(item => {
                let name = item.tags?.name;
                if (!name) return;
                
                let lat = item.lat || item.center?.lat;
                let lng = item.lon || item.center?.lon;
                if (!lat || !lng) return;

                let phone = item.tags?.phone || item.tags?.['contact:phone'] || '';
                let website = item.tags?.website || item.tags?.['contact:website'] || '';
                let category = item.tags?.amenity || item.tags?.shop || item.tags?.craft || item.tags?.office || '';
                if (!category && item.tags?.tourism) category = item.tags.tourism;

                let osmMapUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
                
                if (scoutedResults.length < maxResults) {
                   scoutedResults.push({ 
                     name, phone, website, maps_city: city || '', lat, lng,
                     google_maps_url: osmMapUrl, google_place_id: '',
                     rating: 0, userRatingCount: 0, category
                   });
                }
            });
            
            renderScoutedCards(scoutedResults, existingLeads);
            
            if (importBtn) {
              importBtn.style.display = 'block';
              importBtn.innerText = `Alle ${scoutedResults.length} importieren 📥`;
            }
            if (statusText) statusText.innerText = `Deep Search abgeschlossen: ${scoutedResults.length} Leads gefunden.`;

            await autoEnrichMissingPhones();
        } else {
             resCont.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">Auch mit Deep Search nichts gefunden. Bitte überprüfe deine Suchbegriffe.</div>`;
             if (statusText) statusText.innerText = 'Keine Ergebnisse.';
        }
    } catch (err) {
        resCont.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1; height:auto; color:red;">Overpass Fehler: ${err.message}</div>`;
        if (statusText) statusText.innerText = 'Deep Search Fehler.';
    }
  };

  // Standardized Single Lead CRM Import
  window.importSingleScoutedLead = async (index) => {
    const r = scoutedResults[index];
    if (!r) return;

    const size = document.getElementById('scout-crm-size')?.value || 'Tarifkunde';

    try {
      const existingLeads = await window.api.getLeads({ all: true });
      const extLead = window.findDuplicateCRMLead(r, existingLeads);

      if (extLead) {
        if (extLead.status === 'Uninteressant') {
          showToast("Import übersprungen: Lead ist als uninteressant ausgeschlossen!", true);
        } else {
          showToast("Lead existiert bereits im CRM!", true);
        }
        return;
      }

      let notes = '';
      let locations = [];
      if (r.opening_hours) {
        locations.push({
          address: r.maps_city, lat: r.lat, lng: r.lng, place_id: r.google_place_id, opening_hours: r.opening_hours
        });
      }

      await window.api.saveLead({ 
        name: r.name, phone: r.phone, size, status: 'Lead', 
        maps_city: r.maps_city, lat: r.lat, lng: r.lng, notes: notes, 
        snooze_until_ms: 0, task_text: '', last_contact_ms: 0, 
        website_url: r.website, google_maps_url: r.google_maps_url, google_place_id: r.google_place_id,
        email: r.email, legal_company_name: r.legal_company_name, director_name: r.director_name,
        impressum_phone: r.impressum_phone, estimated_kwh: r.estimated_kwh, locations
      });

      showToast(`"${r.name}" erfolgreich in Kaltakquise importiert! 📥`);
      
      const refreshedLeads = await window.api.getLeads({ all: true });
      renderScoutedCards(scoutedResults, refreshedLeads);

    } catch (err) {
      showToast(`Import fehlgeschlagen: ${err.message}`, true);
    }
  };

  // Standardized CRM Bulk Import
  window.importScoutedLeads = async () => {
    if (scoutedResults.length === 0) return;
    const btn = document.getElementById('scout-import-btn');
    if (btn) {
      btn.innerText = 'Importiere... ⏳';
      btn.disabled = true;
    }

    const size = document.getElementById('scout-crm-size')?.value || 'Tarifkunde';

    try {
      const existingLeads = await window.api.getLeads({ all: true });
      let importedCount = 0;

      for (let r of scoutedResults) {
        if (!r.name) continue;
        
        const canIngest = true;
        if (!canIngest) continue;

        const extLead = window.findDuplicateCRMLead(r, existingLeads);
        if (extLead) continue;

        let notes = '';

        let locations = [];
        if (r.opening_hours) {
          locations.push({
            address: r.maps_city, lat: r.lat, lng: r.lng, place_id: r.google_place_id, opening_hours: r.opening_hours
          });
        }

        await window.api.saveLead({ 
          name: r.name, phone: r.phone, size, status: 'Lead', 
          maps_city: r.maps_city, lat: r.lat, lng: r.lng, notes: notes, 
          snooze_until_ms: 0, task_text: '', last_contact_ms: 0, 
          website_url: r.website, google_maps_url: r.google_maps_url, google_place_id: r.google_place_id,
          email: r.email, legal_company_name: r.legal_company_name, director_name: r.director_name,
          impressum_phone: r.impressum_phone, estimated_kwh: r.estimated_kwh, locations
        });
        importedCount++;
      }

      alert(`${importedCount} frische Leads importiert! 🚀 (${scoutedResults.length - importedCount} übersprungen/Duplikate)`);
      
      scoutedResults = [];
      scoutMarkers.forEach(m => { if(typeof map !== 'undefined' && map.removeLayer) map.removeLayer(m); });
      scoutMarkers = [];
      
      document.getElementById('scout-term').value = '';
      document.getElementById('scout-results').innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">Import erfolgreich.</div>`;
      if (btn) {
        btn.disabled = false;
        btn.style.display = 'none';
      }
      
      // Redirect to Cold Acquisition so they can start dialing
      window.switchTab('cold');
    } catch (err) {
      alert(`Fehler beim Importieren: ${err.message}`);
      if (btn) {
        btn.innerText = 'Import fehlgeschlagen';
        btn.disabled = false;
      }
    }
  };

})();
