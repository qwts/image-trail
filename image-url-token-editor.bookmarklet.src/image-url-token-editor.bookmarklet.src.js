/* global window, document, location, history, localStorage, URL, setTimeout, clearTimeout */
/* global console, fetch, FileReader */
(function () {
  'use strict'

  var APP_ID = '__image_url_token_editor_bookmarklet_v1'
  var STORE_KEY = '__url_image_navigator_state_v1'
  var MAX_HISTORY = 100 // kept for favorites only
  var MAX_DOWNLOAD_RECORDS = 500
  var MAX_Z_INDEX = 2147483647
  var THUMBNAIL_MAX_EDGE = 256
  var FAVORITE_THUMBNAIL_SIZE = 44
  var HISTORY_THUMBNAIL_SIZE = 30
  var LLM_DEFAULT_ENDPOINT = 'http://127.0.0.1:1234/v1/chat/completions'
  var LLM_DEFAULT_MODEL = 'gemma-4-e4b'
  var LLM_DEFAULT_MAX_TOKENS = 220
  var PANEL_SECTION_DEFAULTS = {
    imageDescription: true,
    fullUrl: false,
    domain: false,
    fields: true,
    controls: false,
    styling: false,
    favorites: true,
    history: true
  }

  if (window[APP_ID] && typeof window[APP_ID].destroy === 'function') {
    window[APP_ID].destroy()
    return
  }

  var app = {
    panel: null,
    panelHidden: false,
    targetImg: null,
    model: null,
    fields: [],
    fieldIndex: Object.create(null),
    activeFieldId: null,
    autoRunning: false,
    autoTimer: null,
    autoRemaining: 0,
    auto404Remaining: null,
    lastAppliedUrl: '',
    pendingHistoryUrl: '',
    preloadUp: null,
    preloadDown: null,
    titleEl: null,
    descriptionEl: null,
    statusEl: null,
    fullUrlEl: null,
    domainEl: null,
    fieldsEl: null,
    historyEl: null,
    selectedHistoryUrls: [],
    historyFocusedUrl: '',
    historySelectionAnchorUrl: '',
    favoritesEl: null,
    llmCache: Object.create(null),
    llmInflight: Object.create(null),
    thumbnailCache: Object.create(null),
    thumbnailInflight: Object.create(null),
    settings: loadState(),
    original: {
      htmlCssText: '',
      bodyCssText: '',
      imgCssText: '',
      imgSrc: '',
      imgSrcset: '',
      imgSizes: ''
    },
    cleanupFns: []
  }

  window[APP_ID] = app

  function clonePanelSectionDefaults () {
    return Object.assign({}, PANEL_SECTION_DEFAULTS)
  }

  function defaultState () {
    return {
      direction: 'up',
      step: '1',
      autoCount: '0',
      slideshowPause: '1200',
      autoDelay: '300',
      autoAdvanceOn404: false,
      auto404Count: '0',
      autoDownload: false,
      autoFetchOnQueryChange: false,
      autoFetchTitleOnLoad: false,
      autoFetchDescriptionOnPreload: false,
      previewReplacesStyling: false,
      showHistoryThumbnails: false,
      llmEndpoint: LLM_DEFAULT_ENDPOINT,
      llmModel: LLM_DEFAULT_MODEL,
      llmMaxTokens: String(LLM_DEFAULT_MAX_TOKENS),
      pageBackground: '#000000',
      imageObjectFit: 'contain',
      imageWidth: '100vw',
      imageHeight: '100vh',
      panelSections: clonePanelSectionDefaults(),
      downloadRecords: [],
      history: [],
      favorites: []
    }
  }

  function loadState () {
    var state = defaultState()

    try {
      var saved = window.localStorage.getItem(STORE_KEY)
      if (!saved) return state

      var parsed = JSON.parse(saved)
      Object.keys(state).forEach(function (key) {
        if (Object.prototype.hasOwnProperty.call(parsed, key)) {
          state[key] = parsed[key]
        }
      })

      if (!Array.isArray(state.history)) state.history = []
      if (!Array.isArray(state.favorites)) state.favorites = []
      if (!Array.isArray(state.downloadRecords)) state.downloadRecords = []
      if (!state.panelSections || typeof state.panelSections !== 'object' || Array.isArray(state.panelSections)) {
        state.panelSections = clonePanelSectionDefaults()
      } else {
        state.panelSections = Object.keys(PANEL_SECTION_DEFAULTS).reduce(function (acc, key) {
          acc[key] = typeof state.panelSections[key] === 'boolean'
            ? state.panelSections[key]
            : PANEL_SECTION_DEFAULTS[key]
          return acc
        }, {})
      }
      state.history = state.history
        .map(function (entry) {
          if (!entry || typeof entry !== 'object') return null
          if (!entry.url) return null
          return {
            url: String(entry.url),
            timestamp: String(entry.timestamp || ''),
            title: String(entry.title || ''),
            label: String(entry.label || ''),
            thumbnail: String(entry.thumbnail || ''),
            downloadedAt: String(entry.downloadedAt || '')
          }
        })
        .filter(Boolean)
      state.favorites = state.favorites
        .map(function (entry) {
          if (!entry || typeof entry !== 'object') return null
          if (!entry.url) return null
          return {
            url: String(entry.url),
            timestamp: String(entry.timestamp || ''),
            title: String(entry.title || ''),
            label: String(entry.label || ''),
            thumbnail: String(entry.thumbnail || '')
          }
        })
        .filter(Boolean)
      state.downloadRecords = state.downloadRecords
        .map(function (entry) {
          if (!entry || typeof entry !== 'object') return null
          if (!entry.url) return null
          return {
            url: String(entry.url),
            filename: String(entry.filename || ''),
            timestamp: String(entry.timestamp || ''),
            fingerprint: String(entry.fingerprint || '')
          }
        })
        .filter(Boolean)
        .slice(0, MAX_DOWNLOAD_RECORDS)
    } catch (err) {
      console.warn('[img-nav] state load failed', err)
    }

    return state
  }

  function saveState () {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(app.settings))
    } catch (err) {
      console.warn('[img-nav] state save failed', err)
    }
  }

  function decodeHtmlEntities (value) {
    return String(value || '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
  }

  function safeDecodeURIComponent (value) {
    var text = String(value || '')

    try {
      return window.decodeURIComponent(text)
    } catch (err) {
      return text.replace(/%([0-9a-fA-F]{2})/g, function (match, hex) {
        try {
          return String.fromCharCode(parseInt(hex, 16))
        } catch (innerErr) {
          return match
        }
      })
    }
  }

  function safeEncodeURIComponent (value) {
    return window.encodeURIComponent(String(value == null ? '' : value))
      .replace(/[!'()*]/g, function (char) {
        return '%' + char.charCodeAt(0).toString(16).toUpperCase()
      })
  }

  function safeDecodePathSegment (value) {
    return safeDecodeURIComponent(value)
  }

  function safeEncodePathSegment (value) {
    return safeEncodeURIComponent(value)
  }

  function safeDecodeQueryPart (value) {
    return safeDecodeURIComponent(String(value || '').replace(/\+/g, ' '))
  }

  function safeEncodeQueryPart (value) {
    return safeEncodeURIComponent(value).replace(/%20/g, '+')
  }

  function parseJsonObject (text) {
    if (!text) return {}

    try {
      return JSON.parse(text)
    } catch (err) {
      var source = String(text)
      var start = source.indexOf('{')
      var end = source.lastIndexOf('}')
      if (start === -1 || end === -1 || end < start) return {}
      try {
        return JSON.parse(source.slice(start, end + 1))
      } catch (innerErr) {
        return {}
      }
    }
  }

  function extractMessageText (message) {
    if (!message) return ''
    var content = message.content
    if (typeof content === 'string') return content.trim()
    if (!Array.isArray(content)) return ''

    return content
      .map(function (item) {
        if (typeof item === 'string') return item
        if (item && typeof item.text === 'string') return item.text
        return ''
      })
      .filter(Boolean)
      .join('\n')
      .trim()
  }

  function extensionFromUrl (url) {
    try {
      var parsed = new URL(url, location.href)
      var pathParts = splitPreservingSlashStyle(parsed.pathname).filter(function (part) {
        return part.type === 'segment' && part.raw
      })
      var last = pathParts[pathParts.length - 1]
      var filename = last ? safeDecodePathSegment(last.raw) : ''
      var match = filename.match(/\.([A-Za-z0-9]{2,8})$/)
      return match ? '.' + match[1].toLowerCase() : '.jpg'
    } catch (err) {
      return '.jpg'
    }
  }

  function sanitizeFilename (text) {
    return String(text || '')
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^[_\-.]+|[_\-.]+$/g, '')
  }

  function ensureFilenameExtension (baseName, sourceUrl) {
    var cleaned = sanitizeFilename(baseName)
    if (!cleaned) cleaned = 'image'
    if (/\.[A-Za-z0-9]{2,8}$/.test(cleaned)) return cleaned
    return cleaned + extensionFromUrl(sourceUrl)
  }

  function toDataUrl (blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader()
      reader.onload = function () { resolve(String(reader.result || '')) }
      reader.onerror = function () { reject(new Error('Failed to read image data')) }
      reader.readAsDataURL(blob)
    })
  }

  function fetchImageBlob (url) {
    return window.fetch(url, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store'
    }).then(function (response) {
      if (!response.ok) throw new Error('image fetch failed: HTTP ' + response.status)
      return response.blob()
    })
  }

  function createThumbnailDataUrlFromImage (img, maxEdge) {
    if (!img || !img.naturalWidth || !img.naturalHeight) return ''

    var maxDimension = Math.max(1, maxEdge || THUMBNAIL_MAX_EDGE)
    var scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight))
    var width = Math.max(1, Math.round(img.naturalWidth * scale))
    var height = Math.max(1, Math.round(img.naturalHeight * scale))

    var canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    var context = canvas.getContext('2d')
    if (!context) return ''
    context.drawImage(img, 0, 0, width, height)
    return canvas.toDataURL('image/jpeg', 0.82)
  }

  function createThumbnailDataUrlFromBlob (blob) {
    return new Promise(function (resolve) {
      if (!blob) {
        resolve('')
        return
      }

      var objectUrl = window.URL.createObjectURL(blob)
      var img = new window.Image()
      img.onload = function () {
        var dataUrl = ''
        try {
          dataUrl = createThumbnailDataUrlFromImage(img, THUMBNAIL_MAX_EDGE)
        } catch (err) {
          dataUrl = ''
        }
        window.URL.revokeObjectURL(objectUrl)
        resolve(dataUrl)
      }
      img.onerror = function () {
        window.URL.revokeObjectURL(objectUrl)
        resolve('')
      }
      img.src = objectUrl
    })
  }

  function cacheThumbnailForUrl (url, thumbnail) {
    if (!url || !thumbnail) return
    app.thumbnailCache[url] = thumbnail
    updateFavoriteForUrl(url, { thumbnail: thumbnail })
    updateHistoryForUrl(url, { thumbnail: thumbnail })
  }

  function displayTitleForUrl (url) {
    if (!url) return ''
    var metadata = app.llmCache[url] || {}
    var fetchedTitle = String(metadata.filename || '').trim()
    if (fetchedTitle) return fetchedTitle
    return deriveLabel(url)
  }

  function renderTitleForCurrentUrl () {
    if (!app.titleEl) return
    var currentUrl = app.fullUrlEl ? app.fullUrlEl.value : app.lastAppliedUrl
    app.titleEl.textContent = currentUrl ? displayTitleForUrl(currentUrl) : deriveLabel(location.href)
  }

  function ensureThumbnailForUrl (url, sourceImage) {
    if (!url) return Promise.resolve('')
    if (app.thumbnailCache[url]) return Promise.resolve(app.thumbnailCache[url])
    if (app.thumbnailInflight[url]) return app.thumbnailInflight[url]

    app.thumbnailInflight[url] = Promise.resolve()
      .then(function () {
        if (sourceImage && sourceImage.naturalWidth && sourceImage.naturalHeight) {
          try {
            return createThumbnailDataUrlFromImage(sourceImage, THUMBNAIL_MAX_EDGE)
          } catch (err) {
            return ''
          }
        }
        return ''
      })
      .then(function (thumbnail) {
        if (thumbnail) return thumbnail
        return fetchImageBlob(url)
          .then(createThumbnailDataUrlFromBlob)
          .catch(function () {
            return ''
          })
      })
      .then(function (thumbnail) {
        if (thumbnail) cacheThumbnailForUrl(url, thumbnail)
        return thumbnail
      })
      .finally(function () {
        delete app.thumbnailInflight[url]
      })

    return app.thumbnailInflight[url]
  }

  function llmTitleSchema () {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['filename'],
      properties: {
        filename: {
          type: 'string',
          description: 'Descriptive snake_case filename without extension.'
        }
      }
    }
  }

  function llmDescriptionSchema () {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['description'],
      properties: {
        description: {
          type: 'string',
          description: 'Concise description of visible image content.'
        }
      }
    }
  }

  function describeImageWithLlm (imageInput, sourceUrl, mode) {
    var endpoint = app.settings.llmEndpoint || LLM_DEFAULT_ENDPOINT
    var model = app.settings.llmModel || LLM_DEFAULT_MODEL
    var maxTokens = parseInt(app.settings.llmMaxTokens, 10)
    if (!Number.isFinite(maxTokens) || maxTokens <= 0) maxTokens = LLM_DEFAULT_MAX_TOKENS
    var isTitle = mode === 'title'

    var payload = {
      model: model,
      temperature: 0,
      max_tokens: maxTokens,
      stream: false,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: isTitle ? 'image_title_metadata' : 'image_description_metadata',
          strict: true,
          schema: isTitle ? llmTitleSchema() : llmDescriptionSchema()
        }
      },
      messages: [
        {
          role: 'system',
          content: [
            'Return only valid JSON matching the schema.',
            'Do not wrap JSON in markdown or add extra keys.',
            isTitle ? 'Return only filename.' : 'Return only description.'
          ].join(' ')
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: [
                isTitle
                  ? 'Create a highly descriptive, low-collision download filename for this image.'
                  : 'Create a descriptive caption for this image focused on visible people and context.',
                'Rules:',
                isTitle
                  ? '- filename: snake_case, no extension, 6-14 words, descriptive and specific'
                  : '- description: 1-2 sentences, concrete and specific',
                isTitle
                  ? '- if people are visible, prioritize them first: apparent age group, skin tone/color, apparent gender presentation, and what they are doing'
                  : '- if people are visible, include apparent age group, skin tone/color, apparent gender presentation, and what they are doing',
                isTitle
                  ? '- include scene/action context to reduce collisions (setting, activity, notable objects)'
                  : '- include scene/action context (setting, activity, notable objects)',
                isTitle
                  ? '- avoid vague names like image/photo/pic unless nothing else is visible'
                  : '- include only visible content and avoid unsupported speculation',
                isTitle
                  ? '- example style: a_white_woman_rides_rollercoaster_at_night'
                  : '- if unsure, use neutral wording like person/people',
                '',
                'Source URL: ' + sourceUrl
              ].join('\n')
            },
            {
              type: 'image_url',
              image_url: { url: imageInput }
            }
          ]
        }
      ]
    }

    return window.fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }).then(function (response) {
      if (!response.ok) {
        return response.text().then(function (body) {
          throw new Error('LLM request failed: HTTP ' + response.status + ' ' + (body || ''))
        })
      }
      return response.json()
    }).then(function (data) {
      var message = data && data.choices && data.choices[0] && data.choices[0].message
      var parsed = parseJsonObject(extractMessageText(message))
      if (isTitle) {
        return {
          filename: sanitizeFilename(parsed.filename)
        }
      }
      return {
        description: String(parsed.description || '').trim()
      }
    })
  }

  function metadataCacheKey (url, mode) {
    return mode + '::' + String(url || '')
  }

  function setMetadataFieldForUrl (url, mode, value) {
    if (!url) return
    var existing = app.llmCache[url] || {}
    if (mode === 'title') {
      app.llmCache[url] = {
        filename: String(value || ''),
        description: String(existing.description || '')
      }
      return
    }
    app.llmCache[url] = {
      filename: String(existing.filename || ''),
      description: String(value || '')
    }
  }

  function fallbackMetadataValue (url, mode) {
    var existing = app.llmCache[url] || {}
    if (mode === 'title') {
      return existing.filename || ensureFilenameExtension(deriveTitle(url) || 'image', url)
    }
    return existing.description || 'No description available.'
  }

  function getImageInputForLlm (url) {
    return ensureThumbnailForUrl(url, app.targetImg)
      .then(function (thumbnail) {
        if (thumbnail) return thumbnail
        return fetchImageBlob(url).then(function (blob) {
          return toDataUrl(blob)
        })
      })
      .catch(function () {
        return url
      })
  }

  function runLlmMetadataFetch (url, mode, options) {
    options = options || {}
    if (!url) return Promise.reject(new Error('No URL to fetch metadata for'))

    var key = metadataCacheKey(url, mode)
    if (app.llmInflight[key]) return app.llmInflight[key]

    var llmEndpoint = app.settings.llmEndpoint || LLM_DEFAULT_ENDPOINT
    var label = mode === 'title' ? 'title' : 'description'

    if (!options.silent) setStatus('asking LLM for ' + label + '...')

    app.llmInflight[key] = getImageInputForLlm(url)
      .then(function (imageInput) {
        return describeImageWithLlm(imageInput, url, mode)
      })
      .then(function (metadata) {
        var value = mode === 'title'
          ? ensureFilenameExtension(metadata.filename || deriveTitle(url) || 'image', url)
          : (String(metadata.description || '').trim() || 'No description available.')
        setMetadataFieldForUrl(url, mode, value)
        if (mode === 'title') {
          updateFavoriteForUrl(url, { title: value })
          updateHistoryForUrl(url, { title: value })
        }
        if (app.fullUrlEl && app.fullUrlEl.value === url) {
          renderTitleForCurrentUrl()
          renderDescriptionForCurrentUrl()
        }
        if (!options.silent) setStatus('LLM ' + label + ' ready')
        return value
      })
      .catch(function (err) {
        if (options.strict) {
          console.warn('[img-nav] llm ' + label + ' failed', err)
          if (!options.silent) {
            setStatus('LLM ' + label + ' failed (' + summarizeError(err) + ') via ' + llmEndpoint)
          }
          throw err
        }

        var fallback = fallbackMetadataValue(url, mode)
        setMetadataFieldForUrl(url, mode, fallback)
        if (mode === 'title') {
          updateFavoriteForUrl(url, { title: fallback })
          updateHistoryForUrl(url, { title: fallback })
        }
        if (app.fullUrlEl && app.fullUrlEl.value === url) {
          renderTitleForCurrentUrl()
          renderDescriptionForCurrentUrl()
        }
        console.warn('[img-nav] llm ' + label + ' failed', err)
        if (!options.silent) {
          setStatus('LLM ' + label + ' failed (' + summarizeError(err) + ') via ' + llmEndpoint)
        }
        return fallback
      })
      .finally(function () {
        delete app.llmInflight[key]
      })

    return app.llmInflight[key]
  }

  function renderDescriptionForCurrentUrl () {
    if (!app.descriptionEl) return

    var currentUrl = app.fullUrlEl ? app.fullUrlEl.value : app.lastAppliedUrl
    if (!currentUrl) {
      app.descriptionEl.textContent = 'No description yet.'
      return
    }

    var metadata = app.llmCache[currentUrl]
    if (!metadata || !metadata.description) {
      app.descriptionEl.textContent = 'No description yet. Click Fetch Description to generate one.'
      return
    }

    app.descriptionEl.textContent = metadata.description
  }

  function summarizeError (err) {
    if (!err) return 'unknown error'
    var message = (err && err.message) ? String(err.message) : String(err)
    message = message.replace(/\s+/g, ' ').trim()
    if (message.length > 160) message = message.slice(0, 157) + '...'
    return message || 'unknown error'
  }

  function downloadBlob (blob, filename) {
    var objectUrl = window.URL.createObjectURL(blob)
    var anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = filename
    anchor.rel = 'noopener'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.URL.revokeObjectURL(objectUrl)
  }

  function downloadImageViaCanvas (url, filename) {
    return new Promise(function (resolve) {
      var img = new window.Image()
      img.onload = function () {
        if (!img.naturalWidth || !img.naturalHeight) { resolve(false); return }
        try {
          var canvas = document.createElement('canvas')
          canvas.width = img.naturalWidth
          canvas.height = img.naturalHeight
          var ctx = canvas.getContext('2d')
          if (!ctx) { resolve(false); return }
          ctx.drawImage(img, 0, 0)
          canvas.toBlob(function (blob) {
            if (!blob) { resolve(false); return }
            var a = document.createElement('a')
            a.href = URL.createObjectURL(blob)
            a.download = filename
            a.click()
            resolve(true)
          })
        } catch (e) {
          resolve(false)
        }
      }
      img.onerror = function () { resolve(false) }
      img.src = url
    })
  }

  function normalizeAbsoluteUrl (url) {
    try {
      return new URL(url, location.href).href
    } catch (err) {
      return String(url || '')
    }
  }

  function findHistoryDownloadByUrl (normalizedUrl) {
    if (!normalizedUrl) return null
    var entry = (app.settings.history || []).find(function (item) {
      return item
        && item.downloadedAt
        && normalizeAbsoluteUrl(item.url) === normalizedUrl
    })
    return entry || null
  }

  function findDownloadRecord (normalizedUrl, fingerprint) {
    var records = app.settings.downloadRecords || []
    if (fingerprint) {
      var byFingerprint = records.find(function (entry) {
        return entry && entry.fingerprint && entry.fingerprint === fingerprint
      })
      if (byFingerprint) return byFingerprint
    }
    if (!normalizedUrl) return null
    return records.find(function (entry) {
      return entry && normalizeAbsoluteUrl(entry.url) === normalizedUrl
    }) || null
  }

  function addDownloadRecord (url, filename, fingerprint) {
    var normalizedUrl = normalizeAbsoluteUrl(url)
    var records = (app.settings.downloadRecords || []).filter(function (entry) {
      if (!entry) return false
      if (fingerprint && entry.fingerprint && entry.fingerprint === fingerprint) return false
      return normalizeAbsoluteUrl(entry.url) !== normalizedUrl
    })

    records.unshift({
      url: normalizedUrl,
      filename: String(filename || ''),
      timestamp: new Date().toISOString(),
      fingerprint: String(fingerprint || '')
    })

    app.settings.downloadRecords = records.slice(0, MAX_DOWNLOAD_RECORDS)
    saveState()
  }

  function arrayBufferToHex (buffer) {
    var bytes = new Uint8Array(buffer)
    var parts = new Array(bytes.length)
    for (var i = 0; i < bytes.length; i += 1) {
      var hex = bytes[i].toString(16)
      parts[i] = hex.length === 1 ? '0' + hex : hex
    }
    return parts.join('')
  }

  function computeFingerprintFromBlob (blob) {
    if (!blob || !window.crypto || !window.crypto.subtle || typeof window.crypto.subtle.digest !== 'function') {
      return Promise.resolve('')
    }
    return blob.arrayBuffer()
      .then(function (buffer) {
        return window.crypto.subtle.digest('SHA-256', buffer)
      })
      .then(function (digestBuffer) {
        return arrayBufferToHex(digestBuffer)
      })
      .catch(function () {
        return ''
      })
  }

  function computeImageFingerprint (url) {
    if (!url) return Promise.resolve('')
    return fetchImageBlob(url)
      .then(computeFingerprintFromBlob)
      .catch(function () {
        return ''
      })
  }

  function ensureModelFilenameForUrl (url) {
    var titleKey = metadataCacheKey(url, 'title')
    var inflightTitle = app.llmInflight[titleKey]
    if (inflightTitle) {
      setStatus('waiting for model title before download...')
      return inflightTitle.then(function () {
        return runLlmMetadataFetch(url, 'title', { silent: true, strict: true })
      }).then(function (value) {
        return ensureFilenameExtension(value || deriveTitle(url) || 'image', url)
      })
    }

    setStatus('fetching model filename before download...')
    return runLlmMetadataFetch(url, 'title', { silent: true, strict: true })
      .then(function (value) {
        return ensureFilenameExtension(value || deriveTitle(url) || 'image', url)
      })
  }

  function isProbablyVisible (img) {
    if (!img) return false

    var rect = img.getBoundingClientRect()
    var style = window.getComputedStyle(img)

    return rect.width > 0 &&
      rect.height > 0 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0'
  }

  function imageScore (img) {
    if (!img) return 0

    var rect = img.getBoundingClientRect()
    var naturalArea = (img.naturalWidth || 0) * (img.naturalHeight || 0)
    var renderedArea = rect.width * rect.height

    return Math.max(naturalArea, renderedArea)
  }

  function getImageUrl (img) {
    if (!img) return ''

    return img.currentSrc ||
      img.getAttribute('src') ||
      img.src ||
      img.getAttribute('data-src') ||
      img.getAttribute('data-original') ||
      ''
  }

  function getCandidateUrls () {
    var candidates = []

    var images = Array.prototype.slice.call(document.images || [])
      .filter(function (img) {
        return getImageUrl(img)
      })
      .sort(function (a, b) {
        return imageScore(b) - imageScore(a)
      })

    images.forEach(function (img) {
      var current = getImageUrl(img)
      if (current) candidates.push(current)

      var dataSrc = img.getAttribute('data-src')
      if (dataSrc) candidates.push(dataSrc)

      var parent = img.parentNode
      if (parent && parent.nodeName && parent.nodeName.toLowerCase() === 'picture') {
        Array.prototype.slice.call(parent.querySelectorAll('source')).forEach(function (source) {
          var srcset = source.getAttribute('srcset')
          var firstSrc = srcset && srcset.split(',')[0] && srcset.split(',')[0].trim().split(/\s+/)[0]
          if (firstSrc) candidates.push(firstSrc)
        })
      }
    })

    if (location && location.href) candidates.push(location.href)

    return candidates.filter(Boolean)
  }

  function findTargetImage () {
    var images = Array.prototype.slice.call(document.images || [])
      .filter(function (img) {
        return getImageUrl(img)
      })
      .sort(function (a, b) {
        var visibleDiff = Number(isProbablyVisible(b)) - Number(isProbablyVisible(a))
        if (visibleDiff) return visibleDiff
        return imageScore(b) - imageScore(a)
      })

    if (images[0]) return images[0]

    var img = document.createElement('img')
    img.alt = 'image navigator target'
    document.body.appendChild(img)
    return img
  }

  function resolveUrl (input) {
    var cleaned = decodeHtmlEntities(String(input || '').trim())

    if (!cleaned) cleaned = location.href

    try {
      return new URL(cleaned, location.href)
    } catch (err) {
      var escaped = cleaned.replace(/ /g, '%20')
      try {
        return new URL(escaped, location.href)
      } catch (innerErr) {
        throw new Error('Invalid URL: ' + cleaned)
      }
    }
  }

  function encodedSlashAt (value, index) {
    var slice = value.slice(index)
    var match = slice.match(/^%(?:25)*2f/i)
    return match ? match[0] : ''
  }

  function splitPreservingSlashStyle (pathname) {
    var parts = []
    var buffer = ''
    var index = 0

    while (index < pathname.length) {
      var char = pathname.charAt(index)
      var encodedSlash = encodedSlashAt(pathname, index)

      if (char === '/' || encodedSlash) {
        if (buffer) {
          parts.push({ type: 'segment', raw: buffer })
          buffer = ''
        }

        if (char === '/') {
          parts.push({ type: 'sep', raw: '/' })
          index += 1
        } else {
          parts.push({ type: 'sep', raw: encodedSlash })
          index += encodedSlash.length
        }
      } else {
        buffer += char
        index += 1
      }
    }

    if (buffer) parts.push({ type: 'segment', raw: buffer })

    return parts
  }

  function maybeSplitQueryLikePath (urlObject) {
    var pathname = urlObject.pathname || '/'
    var search = urlObject.search || ''

    if (search) {
      return {
        pathname: pathname,
        queryPrefix: '?',
        searchBody: search.slice(1)
      }
    }

    var match = pathname.match(/([&?])([A-Za-z0-9_.~-]+=[^/]*)$/)
    if (!match) {
      return {
        pathname: pathname,
        queryPrefix: '',
        searchBody: ''
      }
    }

    var splitAt = match.index
    return {
      pathname: pathname.slice(0, splitAt),
      queryPrefix: match[1],
      searchBody: pathname.slice(splitAt + 1)
    }
  }

  function detectNumericType (value) {
    var text = String(value || '')

    if (/^0x[0-9a-fA-F]+$/.test(text)) return 'hex'
    if (/^[0-9]+$/.test(text)) return 'int'
    if (/^[0-9a-fA-F]*[0-9][0-9a-fA-F]*$/.test(text) && /[a-fA-F]/.test(text)) return 'hex'

    return 'text'
  }

  function tokenizeEditableText (text, context) {
    var tokens = []
    var value = String(text == null ? '' : text)
    var regex = /(?:0x[0-9a-fA-F]+|[0-9a-fA-F]*\d[0-9a-fA-F]*)/g
    var lastIndex = 0
    var match

    while ((match = regex.exec(value))) {
      if (match.index > lastIndex) {
        tokens.push({
          kind: 'text',
          value: value.slice(lastIndex, match.index),
          context: context
        })
      }

      tokens.push({
        kind: detectNumericType(match[0]),
        value: match[0],
        width: match[0].replace(/^0x/i, '').length,
        context: context
      })

      lastIndex = match.index + match[0].length
    }

    if (lastIndex < value.length) {
      tokens.push({
        kind: 'text',
        value: value.slice(lastIndex),
        context: context
      })
    }

    if (!tokens.length) {
      tokens.push({
        kind: 'text',
        value: value,
        context: context
      })
    }

    return tokens
  }

  function parseQueryFields (searchBody) {
    if (!searchBody) return []

    return String(searchBody).split('&').map(function (pair, index) {
      var eqIndex = pair.indexOf('=')
      var rawKey = eqIndex === -1 ? pair : pair.slice(0, eqIndex)
      var rawValue = eqIndex === -1 ? '' : pair.slice(eqIndex + 1)

      return {
        type: 'query',
        index: index,
        hasEquals: eqIndex !== -1,
        key: safeDecodeQueryPart(rawKey),
        valueTokens: tokenizeEditableText(safeDecodeQueryPart(rawValue), 'query')
      }
    })
  }

  function parseModel (input) {
    var urlObject = resolveUrl(input)
    var querySplit = maybeSplitQueryLikePath(urlObject)
    var pathParts = splitPreservingSlashStyle(querySplit.pathname)
    var model = {
      protocol: urlObject.protocol || location.protocol,
      host: urlObject.host || location.host,
      hash: urlObject.hash || '',
      pathParts: pathParts,
      queryPrefix: querySplit.queryPrefix,
      queryFields: parseQueryFields(querySplit.searchBody)
    }

    model.pathParts.forEach(function (part, index) {
      if (part.type !== 'segment') return
      part.index = index
      part.tokens = tokenizeEditableText(safeDecodePathSegment(part.raw), 'path')
    })

    return model
  }

  function rebuildTextFromTokens (tokens) {
    return tokens.map(function (token) {
      return String(token.value == null ? '' : token.value)
    }).join('')
  }

  function rebuildPathname (model) {
    return model.pathParts.map(function (part) {
      if (part.type === 'sep') return part.raw
      return safeEncodePathSegment(rebuildTextFromTokens(part.tokens || []))
    }).join('') || '/'
  }

  function rebuildSearch (model) {
    if (!model.queryFields || !model.queryFields.length) return ''

    var body = model.queryFields.map(function (field) {
      var key = safeEncodeQueryPart(field.key)
      var value = safeEncodeQueryPart(rebuildTextFromTokens(field.valueTokens || []))
      return field.hasEquals ? key + '=' + value : key
    }).join('&')

    return (model.queryPrefix || '?') + body
  }

  function rebuildUrl (model) {
    var protocol = model.protocol || location.protocol
    var host = model.host || location.host
    var pathname = rebuildPathname(model)
    var search = rebuildSearch(model)
    var hash = model.hash || ''

    return protocol + '//' + host + pathname + search + hash
  }

  function collectFields (model) {
    var fields = []

    model.pathParts.forEach(function (part, partIndex) {
      if (part.type !== 'segment') return

      ;(part.tokens || []).forEach(function (token, tokenIndex) {
        var decodedSegment = rebuildTextFromTokens(part.tokens || [])
        var labelBase = isLikelyFilename(decodedSegment)
          ? 'file ' + tokenIndex
          : 'path ' + partIndex + '.' + tokenIndex

        var id = 'p:' + partIndex + ':' + tokenIndex
        token.id = id
        token.label = labelBase
        token.partIndex = partIndex
        token.tokenIndex = tokenIndex

        fields.push({
          id: id,
          label: labelBase,
          kind: token.kind,
          token: token,
          width: token.width || String(token.value || '').length,
          location: 'path'
        })
      })
    })

    ;(model.queryFields || []).forEach(function (queryField, queryIndex) {
      ;(queryField.valueTokens || []).forEach(function (token, tokenIndex) {
        var id = 'q:' + queryIndex + ':' + tokenIndex
        token.id = id
        token.label = 'query ' + queryField.key
        token.queryIndex = queryIndex
        token.tokenIndex = tokenIndex

        fields.push({
          id: id,
          label: 'query ' + queryField.key,
          kind: token.kind,
          token: token,
          width: token.width || String(token.value || '').length,
          location: 'query'
        })
      })
    })

    app.fields = fields
    app.fieldIndex = Object.create(null)
    fields.forEach(function (field) {
      app.fieldIndex[field.id] = field
    })

    if (!app.activeFieldId || !app.fieldIndex[app.activeFieldId]) {
      var firstNumeric = fields.filter(function (field) {
        return field.kind === 'int' || field.kind === 'hex'
      })[0]
      app.activeFieldId = firstNumeric ? firstNumeric.id : fields[0] && fields[0].id
    }
  }

  function isLikelyFilename (segment) {
    return /\.[A-Za-z0-9]{2,8}$/.test(String(segment || '')) || /\./.test(String(segment || ''))
  }

  function getFieldValue (field) {
    return String(field && field.token && field.token.value != null ? field.token.value : '')
  }

  function findMatchingFieldInModel (model, sourceField) {
    if (!model || !sourceField || !sourceField.id) return null

    var parts = sourceField.id.split(':')
    var type = parts[0]
    var tokenIndex = Number(parts[2])

    if (type === 'p') {
      var partIndex = Number(parts[1])
      var part = (model.pathParts || [])[partIndex]
      if (!part || part.type !== 'segment') return null
      var token = (part.tokens || [])[tokenIndex]
      if (!token) return null
      return { token: token, kind: token.kind, width: token.width || String(token.value || '').length }
    }

    if (type === 'q') {
      var keyMatch = (sourceField.label || '').match(/^query (.+)$/)
      if (!keyMatch) return null
      var key = keyMatch[1]
      for (var i = 0; i < (model.queryFields || []).length; i++) {
        var qf = model.queryFields[i]
        if (qf.key === key) {
          var qToken = (qf.valueTokens || [])[tokenIndex]
          if (!qToken) return null
          return { token: qToken, kind: qToken.kind, width: qToken.width || String(qToken.value || '').length }
        }
      }
    }

    return null
  }

  function applyFieldChangeToSelectedHistory (field) {
    if (!field || app.selectedHistoryUrls.length === 0) return

    var newValue = getFieldValue(field)
    var selectedSet = Object.create(null)
    app.selectedHistoryUrls.forEach(function (url) { selectedSet[url] = true })

    var updatedCount = 0
    var urlMap = Object.create(null)

    app.settings.history = (app.settings.history || []).map(function (item) {
      if (!item || !item.url || !selectedSet[item.url]) return item
      var targetModel
      try {
        targetModel = parseModel(item.url)
      } catch (e) {
        return item
      }
      var match = findMatchingFieldInModel(targetModel, field)
      if (!match) return item
      setFieldValue(match, newValue)
      var newUrl = rebuildUrl(targetModel)
      urlMap[item.url] = newUrl
      updatedCount++
      return Object.assign({}, item, { url: newUrl })
    })

    if (updatedCount === 0) return

    app.selectedHistoryUrls = app.selectedHistoryUrls.map(function (url) { return urlMap[url] || url })
    if (app.historyFocusedUrl && urlMap[app.historyFocusedUrl]) app.historyFocusedUrl = urlMap[app.historyFocusedUrl]
    if (app.historySelectionAnchorUrl && urlMap[app.historySelectionAnchorUrl]) app.historySelectionAnchorUrl = urlMap[app.historySelectionAnchorUrl]

    saveState()
    renderHistory()
    setStatus('Updated ' + updatedCount + ' selected history item' + (updatedCount === 1 ? '' : 's'))
  }

  function applyDomainToSelectedHistory () {
    if (!app.model || app.selectedHistoryUrls.length === 0) return

    var newHost = app.model.host
    var selectedSet = Object.create(null)
    app.selectedHistoryUrls.forEach(function (url) { selectedSet[url] = true })

    var updatedCount = 0
    var urlMap = Object.create(null)

    app.settings.history = (app.settings.history || []).map(function (item) {
      if (!item || !item.url || !selectedSet[item.url]) return item
      var targetModel
      try {
        targetModel = parseModel(item.url)
      } catch (e) {
        return item
      }
      targetModel.host = newHost
      var newUrl = rebuildUrl(targetModel)
      urlMap[item.url] = newUrl
      updatedCount++
      return Object.assign({}, item, { url: newUrl })
    })

    if (updatedCount === 0) return

    app.selectedHistoryUrls = app.selectedHistoryUrls.map(function (url) { return urlMap[url] || url })
    if (app.historyFocusedUrl && urlMap[app.historyFocusedUrl]) app.historyFocusedUrl = urlMap[app.historyFocusedUrl]
    if (app.historySelectionAnchorUrl && urlMap[app.historySelectionAnchorUrl]) app.historySelectionAnchorUrl = urlMap[app.historySelectionAnchorUrl]

    saveState()
    renderHistory()
    setStatus('Updated domain on ' + updatedCount + ' selected history item' + (updatedCount === 1 ? '' : 's'))
  }

  function setFieldValue (field, value) {
    if (!field || !field.token) return

    field.token.value = String(value == null ? '' : value)
    field.kind = detectNumericType(field.token.value)
    field.token.kind = field.kind

    if (field.kind === 'int' || field.kind === 'hex') {
      var stripped = field.token.value.replace(/^0x/i, '')
      field.width = Math.max(Number(field.width || 0), stripped.length)
      field.token.width = field.width
    }
  }

  function padNumberText (value, width) {
    var text = String(value)
    var negative = text.charAt(0) === '-'
    var body = negative ? text.slice(1) : text

    while (body.length < width) body = '0' + body

    return negative ? '-' + body : body
  }

  function bumpField (field, delta) {
    if (!field) return false
    if (field.kind !== 'int' && field.kind !== 'hex') return false

    var current = getFieldValue(field)
    var width = Number(field.width || field.token.width || current.replace(/^0x/i, '').length || 1)
    var normalizedDelta = Number.isFinite(delta) ? Math.trunc(delta) : 0
    var deltaBigInt = BigInt(normalizedDelta)
    var next

    if (field.kind === 'hex') {
      var hasPrefix = /^0x/i.test(current)
      var body = current.replace(/^0x/i, '')
      var upper = /[A-F]/.test(body)
      var value
      try {
        value = body ? BigInt('0x' + body) : BigInt(0)
      } catch (err) {
        return false
      }
      var bumped = value + deltaBigInt
      if (bumped < BigInt(0)) bumped = BigInt(0)
      var nextBody = bumped.toString(16)
      if (upper) nextBody = nextBody.toUpperCase()
      nextBody = padNumberText(nextBody, width)
      next = hasPrefix ? '0x' + nextBody : nextBody
    } else {
      var intValue
      try {
        intValue = BigInt(current || '0')
      } catch (err) {
        return false
      }
      var nextInt = intValue + deltaBigInt
      if (nextInt < BigInt(0)) nextInt = BigInt(0)
      next = padNumberText(nextInt.toString(10), width)
    }

    setFieldValue(field, next)
    return true
  }

  function getStep () {
    var value = parseInt(app.settings.step, 10)
    return Number.isFinite(value) && value > 0 ? value : 1
  }

  function getSlideshowPause () {
    var value = parseInt(app.settings.slideshowPause, 10)
    return Number.isFinite(value) && value >= 0 ? value : 1200
  }

  function get404Delay () {
    var value = parseInt(app.settings.autoDelay, 10)
    return Number.isFinite(value) && value >= 0 ? value : 300
  }

  function consumeRemainingStep () {
    if (!Number.isFinite(app.autoRemaining)) return true
    if (app.autoRemaining <= 0) return false
    app.autoRemaining -= 1
    return true
  }

  function start404AutoAdvanceCycle () {
    var configuredCount = parseInt(app.settings.auto404Count, 10)
    if (!Number.isFinite(configuredCount) || configuredCount <= 0) {
      app.auto404Remaining = Number.POSITIVE_INFINITY
      return
    }
    app.auto404Remaining = configuredCount
  }

  function setStatus (message) {
    if (app.statusEl) app.statusEl.textContent = message
    console.log('[img-nav]', message)
  }

  function styleTargetImage () {
    if (!app.targetImg) return

    if (app.settings.previewReplacesStyling === false) {
      document.documentElement.style.cssText = app.original.htmlCssText
      document.body.style.cssText = app.original.bodyCssText
      app.targetImg.style.cssText = app.original.imgCssText
      return
    }

    document.documentElement.style.background = app.settings.pageBackground || '#000000'
    document.body.style.background = app.settings.pageBackground || '#000000'
    document.body.style.margin = '0'
    document.body.style.overflow = 'hidden'

    app.targetImg.style.display = 'block'
    app.targetImg.style.width = app.settings.imageWidth || '100vw'
    app.targetImg.style.height = app.settings.imageHeight || '100vh'
    app.targetImg.style.maxWidth = 'none'
    app.targetImg.style.maxHeight = 'none'
    app.targetImg.style.objectFit = app.settings.imageObjectFit || 'contain'
    app.targetImg.style.background = app.settings.pageBackground || '#000000'
  }

  function removeResponsiveSourceAttrs (img) {
    if (!img) return

    img.removeAttribute('srcset')
    img.removeAttribute('sizes')

    var parent = img.parentNode
    if (parent && parent.nodeName && parent.nodeName.toLowerCase() === 'picture') {
      Array.prototype.slice.call(parent.querySelectorAll('source')).forEach(function (source) {
        source.removeAttribute('srcset')
        source.removeAttribute('sizes')
      })
    }
  }

  function updateLocationBarIfAllowed (url) {
    try {
      var next = new URL(url, location.href)
      if (next.origin !== location.origin) {
        setStatus('location bar not changed: cross-origin')
        return false
      }

      history.pushState(history.state, document.title, next.href)
      setStatus('same-origin location updated')
      return true
    } catch (err) {
      setStatus('location bar not changed: invalid URL')
      return false
    }
  }

  function applyCurrentUrl (options) {
    options = options || {}

    if (!app.model) return ''

    var url = rebuildUrl(app.model)
    app.lastAppliedUrl = url
    app.pendingHistoryUrl = url

    if (app.fullUrlEl) app.fullUrlEl.value = url
    if (app.domainEl) app.domainEl.value = app.model.host || ''
    renderTitleForCurrentUrl()

    saveState()
    styleTargetImage()
    removeResponsiveSourceAttrs(app.targetImg)

    if (app.targetImg) {
      app.targetImg.removeAttribute('src')
      app.targetImg.src = ''
      app.targetImg.setAttribute('src', url)
      app.targetImg.src = url
    }

    triggerPreloads()
    maybeAutoFetchForQueryChange(url)

    if (options.updateLocation !== false) updateLocationBarIfAllowed(url)

    setStatus('URL applied')
    renderDescriptionForCurrentUrl()
    renderHistory()
    renderFields()

    return url
  }

  function parseAndApplyUrl (url, options) {
    try {
      app.model = parseModel(url)
      collectFields(app.model)
      applyCurrentUrl(options)
      renderAll()
      return true
    } catch (err) {
      setStatus(err.message || 'invalid URL')
      return false
    }
  }

  function addHistory (url) {
    if (!url) return
    var existingEntry = (app.settings.history || []).find(function (item) {
      return item && item.url === url
    }) || null

    var existing = app.settings.history.filter(function (item) {
      return item.url !== url
    })

    existing.unshift({
      url: url,
      timestamp: new Date().toISOString(),
      title: String((app.llmCache[url] && app.llmCache[url].filename) || deriveTitle(url)),
      label: deriveLabel(url),
      thumbnail: String(app.thumbnailCache[url] || ''),
      downloadedAt: String((existingEntry && existingEntry.downloadedAt) || '')
    })

    app.settings.history = existing
    saveState()
  }

  function addFavorite (url) {
    if (!url) return

    var metadata = app.llmCache[url] || {}
    var existing = app.settings.favorites.filter(function (item) {
      return item.url !== url
    })

    existing.unshift({
      url: url,
      timestamp: new Date().toISOString(),
      title: String(metadata.filename || deriveTitle(url)),
      label: deriveLabel(url),
      thumbnail: String(app.thumbnailCache[url] || '')
    })

    app.settings.favorites = existing.slice(0, MAX_HISTORY)
    saveState()
  }

  function updateFavoriteForUrl (url, patch) {
    if (!url || !patch) return
    var changed = false

    ;(app.settings.favorites || []).forEach(function (entry) {
      if (entry.url !== url) return
      Object.keys(patch).forEach(function (key) {
        var nextValue = patch[key]
        if (nextValue == null) return
        var nextText = String(nextValue)
        if (entry[key] !== nextText) {
          entry[key] = nextText
          changed = true
        }
      })
    })

    if (changed) {
      saveState()
      renderFavorites()
    }
  }

  function updateHistoryForUrl (url, patch) {
    if (!url || !patch) return
    var changed = false

    ;(app.settings.history || []).forEach(function (entry) {
      if (entry.url !== url) return
      Object.keys(patch).forEach(function (key) {
        var nextValue = patch[key]
        if (nextValue == null) return
        var nextText = String(nextValue)
        if (entry[key] !== nextText) {
          entry[key] = nextText
          changed = true
        }
      })
    })

    if (changed) {
      saveState()
      renderHistory()
    }
  }

  function deriveTitle (url) {
    try {
      var parsed = new URL(url, location.href)
      var pathParts = splitPreservingSlashStyle(parsed.pathname).filter(function (part) {
        return part.type === 'segment' && part.raw
      })
      var last = pathParts[pathParts.length - 1]
      if (last) return safeDecodePathSegment(last.raw)
      if (document.title) return document.title
      return parsed.host
    } catch (err) {
      return document.title || 'image'
    }
  }

  function deriveLabel (url) {
    try {
      var parsed = new URL(url, location.href)
      var pathParts = splitPreservingSlashStyle(parsed.pathname).filter(function (part) {
        return part.type === 'segment' && part.raw
      })
      var last = pathParts[pathParts.length - 1]
      var filename = last ? safeDecodePathSegment(last.raw) : parsed.host
      return filename + ' \u2013 ' + parsed.host
    } catch (err) {
      return url
    }
  }

  function downloadImageByUrl (url) {
    if (!url) return Promise.resolve()

    var normalizedUrl = normalizeAbsoluteUrl(url)
    var fallbackFilename = ensureFilenameExtension(deriveTitle(url) || 'image', url)
    var filenamePromise = ensureModelFilenameForUrl(url).catch(function (err) {
      console.warn('[img-nav] model filename unavailable, using fallback', err)
      return fallbackFilename
    })

    return filenamePromise
      .then(function (filename) {
        var fromHistory = findHistoryDownloadByUrl(normalizedUrl)
        if (fromHistory) {
          setStatus('blocked: this image URL was already downloaded')
          return false
        }

        return computeImageFingerprint(url).then(function (fingerprint) {
          var existing = findDownloadRecord(normalizedUrl, fingerprint)
          if (existing) {
            setStatus('blocked: matching image already downloaded')
            return false
          }

          var isCrossOrigin = false
          try { isCrossOrigin = new URL(normalizedUrl).origin !== location.origin } catch (e) {}

          if (isCrossOrigin) {
            return downloadImageViaCanvas(url, filename).then(function (ok) {
              if (!ok) {
                window.location.href = url
                setStatus('opening image in tab (cross-origin)')
                return false
              }
              if (!(app.settings.history || []).some(function (entry) { return entry.url === url })) addHistory(url)
              updateHistoryForUrl(url, { downloadedAt: new Date().toISOString(), title: filename })
              addDownloadRecord(url, filename, '')
              setStatus('download requested (canvas): ' + filename)
              return true
            })
          }

          return fetchImageBlob(url)
            .then(function (blob) {
              return computeFingerprintFromBlob(blob).then(function (blobFingerprint) {
                var exact = findDownloadRecord(normalizedUrl, blobFingerprint || fingerprint)
                if (exact) {
                  setStatus('blocked: matching image already downloaded')
                  return false
                }

                downloadBlob(blob, filename)
                if (!(app.settings.history || []).some(function (entry) { return entry.url === url })) addHistory(url)
                updateHistoryForUrl(url, { downloadedAt: new Date().toISOString(), title: filename })
                addDownloadRecord(url, filename, blobFingerprint || fingerprint)
                setStatus('download requested: ' + filename)
                return true
              })
            })
            .catch(function () {
              return downloadImageViaCanvas(url, filename).then(function (ok) {
                if (!ok) {
                  setStatus('download blocked: cross-origin image')
                  return false
                }
                if (!(app.settings.history || []).some(function (entry) { return entry.url === url })) addHistory(url)
                updateHistoryForUrl(url, { downloadedAt: new Date().toISOString(), title: filename })
                addDownloadRecord(url, filename, fingerprint)
                setStatus('download requested (canvas fallback): ' + filename)
                return true
              })
            })
        })
      })
      .catch(function (err) {
        setStatus('download blocked: ' + summarizeError(err))
        return false
      })
  }

  function downloadCurrentImage () {
    var url = app.fullUrlEl ? app.fullUrlEl.value : app.lastAppliedUrl
    return downloadImageByUrl(url)
  }

  function fetchTitleForCurrentImage () {
    var url = app.fullUrlEl ? app.fullUrlEl.value : app.lastAppliedUrl
    if (!url) return
    runLlmMetadataFetch(url, 'title')
  }

  function fetchDescriptionForCurrentImage () {
    var url = app.fullUrlEl ? app.fullUrlEl.value : app.lastAppliedUrl
    if (!url) return
    runLlmMetadataFetch(url, 'description')
  }

  function maybeAutoFetchForQueryChange (url) {
    if (!app.settings.autoFetchOnQueryChange || !url) return
    runLlmMetadataFetch(url, 'title', { silent: true })
    runLlmMetadataFetch(url, 'description', { silent: true })
  }

  function downloadTextFile (filename, text) {
    var blob = new window.Blob([String(text == null ? '' : text)], { type: 'application/json;charset=utf-8' })
    var objectUrl = window.URL.createObjectURL(blob)
    var anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = filename
    anchor.rel = 'noopener'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.URL.revokeObjectURL(objectUrl)
  }

  function saveFavoritesFile () {
    var favorites = app.settings.favorites || []
    if (!favorites.length) {
      setStatus('no favorites to save')
      return
    }

    var payload = JSON.stringify({
      exportedAt: new Date().toISOString(),
      sourcePage: location.href,
      favorites: favorites
    }, null, 2)

    downloadTextFile('image-url-favorites.json', payload)
    setStatus('favorites file saved')
  }

  function moveActiveField (direction) {
    var field = app.fieldIndex[app.activeFieldId]
    var signedStep = direction === 'down' ? -getStep() : getStep()

    if (!bumpField(field, signedStep)) {
      setStatus('no numeric active field')
      return false
    }

    applyCurrentUrl()
    return true
  }

  function computeUrlAtDelta (delta) {
    var field = app.fieldIndex[app.activeFieldId]
    if (!field || !field.token) return null

    var savedValue = field.token.value
    var savedKind = field.kind
    var savedWidth = field.width
    var savedTokenKind = field.token.kind
    var savedTokenWidth = field.token.width

    if (!bumpField(field, delta)) return null

    var url = rebuildUrl(app.model)

    field.token.value = savedValue
    field.kind = savedKind
    field.width = savedWidth
    field.token.kind = savedTokenKind
    field.token.width = savedTokenWidth

    return url
  }

  function preloadWithRetry (directionSign, maxAttempts) {
    var step = getStep()
    var attempt = 0
    var img = new window.Image()

    function tryNext () {
      attempt += 1
      if (attempt > maxAttempts) return
      var url = computeUrlAtDelta(directionSign * step * attempt)
      if (!url) return
      img.onerror = tryNext
      img.onload = function () {
        if (app.settings.autoFetchDescriptionOnPreload) {
          runLlmMetadataFetch(url, 'description', { silent: true })
        }
      }
      img.src = url
    }

    tryNext()
    return img
  }

  function triggerPreloads () {
    var maxAttempts = app.settings.autoAdvanceOn404
      ? Math.max(1, parseInt(app.settings.autoCount, 10) || 10)
      : 1
    app.preloadUp = preloadWithRetry(1, maxAttempts)
    app.preloadDown = preloadWithRetry(-1, maxAttempts)
  }

  function scheduleSlideshowStep (delayMs) {
    if (!app.autoRunning) return
    if (app.autoTimer) {
      clearTimeout(app.autoTimer)
      app.autoTimer = null
    }
    app.autoTimer = setTimeout(slideshowStep, delayMs)
  }

  function startSlideshow () {
    if (app.autoRunning) return

    app.autoRunning = true
    var count = parseInt(app.settings.autoCount, 10)
    app.autoRemaining = Number.isFinite(count) && count > 0
      ? count
      : Number.POSITIVE_INFINITY
    setStatus('slideshow started')
    scheduleSlideshowStep(getSlideshowPause())
  }

  function stopSlideshow (message) {
    app.autoRunning = false
    app.autoRemaining = 0

    if (app.autoTimer) {
      clearTimeout(app.autoTimer)
      app.autoTimer = null
    }

    setStatus(message || 'slideshow stopped')
  }

  function slideshowStep () {
    if (!app.autoRunning) return

    if (!consumeRemainingStep()) {
      stopSlideshow('slideshow stopped: max steps reached')
      return
    }

    if (!moveActiveField(app.settings.direction || 'up')) {
      stopSlideshow('slideshow stopped: no numeric active field')
    }
  }

  function schedule404Advance () {
    if (!app.settings.autoAdvanceOn404) return
    if (app.auto404Remaining == null) start404AutoAdvanceCycle()
    if (app.auto404Remaining !== Number.POSITIVE_INFINITY && app.auto404Remaining <= 0) {
      app.auto404Remaining = null
      setStatus('404 auto-advance stopped: retry limit reached')
      return
    }
    if (app.auto404Remaining !== Number.POSITIVE_INFINITY) app.auto404Remaining -= 1

    var delay = get404Delay()
    if (app.autoTimer) {
      clearTimeout(app.autoTimer)
      app.autoTimer = null
    }
    app.autoTimer = setTimeout(function () {
      if (!moveActiveField(app.settings.direction || 'up')) {
        app.auto404Remaining = null
        setStatus('404 auto-advance stopped: no numeric active field')
      }
    }, delay)
  }

  function onImageLoad () {
    setStatus('loaded (click Fetch Title/Fetch Description to run LLM)')
    app.auto404Remaining = null
    var currentUrl = app.fullUrlEl ? app.fullUrlEl.value : app.lastAppliedUrl

    if (currentUrl) {
      ensureThumbnailForUrl(currentUrl, app.targetImg)
        .then(function () {
          renderFavorites()
          renderHistory()
        })
        .catch(function () {})
    }

    if (app.pendingHistoryUrl) {
      addHistory(app.pendingHistoryUrl)
      app.pendingHistoryUrl = ''
      renderHistory()
    }

    if (app.settings.autoDownload) downloadCurrentImage()
    if (app.settings.autoFetchTitleOnLoad && currentUrl) {
      runLlmMetadataFetch(currentUrl, 'title', { silent: true })
    }
    if (app.settings.autoFetchDescriptionOnPreload && currentUrl) {
      runLlmMetadataFetch(currentUrl, 'description', { silent: true })
    }
    if (app.autoRunning) scheduleSlideshowStep(getSlideshowPause())
  }

  function onImageError () {
    app.pendingHistoryUrl = ''
    setStatus('404 / image error (not saved in history)')
    schedule404Advance()
    if (app.autoRunning && !app.settings.autoAdvanceOn404) {
      scheduleSlideshowStep(getSlideshowPause())
    }
  }

  function createEl (tagName, attrs, children) {
    var el = document.createElement(tagName)

    Object.keys(attrs || {}).forEach(function (key) {
      var value = attrs[key]

      if (key === 'style') {
        Object.keys(value || {}).forEach(function (styleKey) {
          el.style[styleKey] = value[styleKey]
        })
      } else if (key === 'text') {
        el.textContent = value
      } else if (key === 'html') {
        el.innerHTML = value
      } else if (key.slice(0, 2) === 'on' && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value)
      } else if (value !== false && value != null) {
        el.setAttribute(key, value === true ? key : String(value))
      }
    })

    ;(children || []).forEach(function (child) {
      if (child == null) return
      el.appendChild(typeof child === 'string' ? document.createTextNode(child) : child)
    })

    return el
  }

  function button (label, onClick, extraStyle) {
    return createEl('button', {
      type: 'button',
      text: label,
      onclick: onClick,
      style: Object.assign({
        background: '#222',
        color: '#fff',
        border: '1px solid #666',
        borderRadius: '4px',
        padding: '5px 8px',
        cursor: 'pointer',
        font: '12px system-ui, sans-serif'
      }, extraStyle || {})
    })
  }

  function input (value, onInput, extraStyle, onApply) {
    return createEl('input', {
      value: value == null ? '' : value,
      oninput: function (event) {
        onInput(event.target.value, event)
      },
      onkeydown: function (event) {
        if (event.key === 'Enter') {
          event.target.blur()
          applyCurrentUrl()
          if (onApply) onApply()
        }
        if (event.key === 'Escape') event.target.blur()
      },
      style: Object.assign({
        width: '100%',
        boxSizing: 'border-box',
        background: '#111',
        color: '#fff',
        border: '1px solid #555',
        borderRadius: '4px',
        padding: '4px',
        font: '12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
      }, extraStyle || {})
    })
  }

  function label (text) {
    return createEl('div', {
      text: text,
      style: {
        color: '#bbb',
        font: '11px system-ui, sans-serif',
        margin: '6px 0 3px'
      }
    })
  }

  function isSectionExpanded (sectionId) {
    if (!sectionId) return true
    var sections = app.settings && app.settings.panelSections
    if (!sections || typeof sections !== 'object') return PANEL_SECTION_DEFAULTS[sectionId] !== false
    if (typeof sections[sectionId] === 'boolean') return sections[sectionId]
    return PANEL_SECTION_DEFAULTS[sectionId] !== false
  }

  function setSectionExpanded (sectionId, expanded) {
    if (!sectionId) return
    if (!app.settings.panelSections || typeof app.settings.panelSections !== 'object') {
      app.settings.panelSections = clonePanelSectionDefaults()
    }
    app.settings.panelSections[sectionId] = !!expanded
    saveState()
  }

  function section (title, children, options) {
    var opts = options || {}
    var sectionId = opts.id || ''
    var collapsedByDefault = opts.collapsedByDefault === true
    var expanded = sectionId ? isSectionExpanded(sectionId) : !collapsedByDefault

    var container = createEl('div', {
      style: {
        borderTop: '1px solid rgba(255,255,255,0.16)',
        marginTop: '10px',
        paddingTop: '8px'
      }
    })

    var indicator = createEl('span', {
      text: expanded ? '[-]' : '[+]',
      style: {
        color: '#9ee',
        marginRight: '6px',
        font: '700 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
      }
    })

    var titleEl = createEl('span', {
      text: title,
      style: {
        font: '700 12px system-ui, sans-serif',
        color: '#fff'
      }
    })

    var contentEl = createEl('div', {
      style: {
        display: expanded ? '' : 'none',
        marginTop: '6px'
      }
    }, children || [])

    function toggleSection () {
      expanded = !expanded
      indicator.textContent = expanded ? '[-]' : '[+]'
      contentEl.style.display = expanded ? '' : 'none'
      if (sectionId) setSectionExpanded(sectionId, expanded)
    }

    if (sectionId) {
      container.appendChild(createEl('button', {
        type: 'button',
        onclick: toggleSection,
        style: {
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          padding: '0',
          border: '0',
          background: 'transparent',
          color: '#fff',
          cursor: 'pointer',
          textAlign: 'left'
        }
      }, [indicator, titleEl]))
    } else {
      container.appendChild(createEl('div', {
        style: {
          display: 'flex',
          alignItems: 'center'
        }
      }, [titleEl]))
    }

    container.appendChild(contentEl)
    return container
  }

  function renderPanel () {
    if (app.panel) app.panel.remove()

    app.panel = createEl('div', {
      id: 'image-url-token-editor-panel',
      style: {
        position: 'fixed',
        left: '0',
        top: '0',
        bottom: '0',
        width: '370px',
        maxWidth: '92vw',
        overflowY: 'auto',
        zIndex: String(MAX_Z_INDEX),
        background: 'rgba(0, 0, 0, 0.74)',
        color: '#fff',
        padding: '10px',
        boxSizing: 'border-box',
        font: '12px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
        boxShadow: '0 0 18px rgba(0,0,0,0.6)'
      }
    })

    app.statusEl = createEl('div', {
      text: 'ready',
      style: {
        color: '#9ee',
        font: '12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        margin: '4px 0 8px',
        wordBreak: 'break-word'
      }
    })

    app.fullUrlEl = createEl('textarea', {
      value: app.model ? rebuildUrl(app.model) : '',
      rows: '4',
      oninput: function () {},
      onkeydown: function (event) {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          parseAndApplyUrl(app.fullUrlEl.value)
        }
        if (event.key === 'Escape') event.target.blur()
      },
      style: {
        width: '100%',
        boxSizing: 'border-box',
        resize: 'vertical',
        background: '#111',
        color: '#fff',
        border: '1px solid #555',
        borderRadius: '4px',
        padding: '5px',
        font: '12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
      }
    })

    app.domainEl = input(app.model ? app.model.host : '', function (value) {
      if (!app.model) return
      app.model.host = value.trim()
      saveState()
    }, null, function () {
      applyDomainToSelectedHistory()
    })

    app.fieldsEl = createEl('div')
    app.historyEl = createEl('div')
    app.favoritesEl = createEl('div')
    app.descriptionEl = createEl('div', {
      text: 'No description yet.',
      style: {
        color: '#ddd',
        font: '12px system-ui, sans-serif',
        lineHeight: '1.4',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word'
      }
    })

    app.titleEl = createEl('div', {
      text: '',
      style: {
        font: '700 14px system-ui, sans-serif',
        marginBottom: '4px',
        wordBreak: 'break-word'
      }
    })

    app.panel.appendChild(app.titleEl)
    app.panel.appendChild(section('Image Description', [app.descriptionEl], { id: 'imageDescription' }))

    app.panel.appendChild(app.statusEl)
    app.panel.appendChild(section('Full URL', [
      app.fullUrlEl,
      createEl('div', {
        style: {
          display: 'flex',
          gap: '6px',
          flexWrap: 'wrap',
          marginTop: '6px'
        }
      }, [
        button('Apply URL', function () { parseAndApplyUrl(app.fullUrlEl.value) }),
        button('Save State', function () { saveState(); setStatus('state saved') }),
        button('Close Panel', destroy)
      ])
    ], { id: 'fullUrl' }))

    app.panel.appendChild(section('Domain', [app.domainEl], { id: 'domain' }))
    app.panel.appendChild(section('Fields', [app.fieldsEl], { id: 'fields' }))
    app.panel.appendChild(section('Controls', renderControls(), { id: 'controls' }))
    app.panel.appendChild(section('Styling', renderStyleControls(), { id: 'styling' }))
    app.panel.appendChild(section('Favorites', [app.favoritesEl], { id: 'favorites' }))
    app.panel.appendChild(section('History', [app.historyEl], { id: 'history' }))

    document.body.appendChild(app.panel)
    if (app.panelHidden) app.panel.style.display = 'none'
    renderFields()
    renderFavorites()
    renderHistory()
    renderTitleForCurrentUrl()
    renderDescriptionForCurrentUrl()
  }

  function setPanelHidden (hidden) {
    app.panelHidden = hidden
    if (app.panel) app.panel.style.display = hidden ? 'none' : ''
  }

  function fieldShortcutKey (index) {
    if (index < 0 || index > 24) return ''
    if (index < 7) return String.fromCharCode(97 + index)
    return String.fromCharCode(98 + index)
  }

  function fieldIndexForShortcutKey (key) {
    if (key === 'h') return -1

    var code = key.charCodeAt(0) - 97
    if (code < 0 || code > 25) return -1
    if (code > 7) return code - 1
    return code
  }

  function renderControls () {
    var direction = createEl('select', {
      onchange: function (event) {
        app.settings.direction = event.target.value
        saveState()
      },
      style: {
        width: '100%',
        background: '#111',
        color: '#fff',
        border: '1px solid #555',
        borderRadius: '4px',
        padding: '4px'
      }
    }, [
      createEl('option', { value: 'up', text: 'up / + step', selected: app.settings.direction === 'up' }),
      createEl('option', { value: 'down', text: 'down / - step', selected: app.settings.direction === 'down' })
    ])

    return [
      label('Direction'),
      direction,
      label('Step'),
      input(app.settings.step, function (value) { app.settings.step = value; saveState() }),
      label('Slideshow count (0 = infinite)'),
      input(app.settings.autoCount, function (value) { app.settings.autoCount = value; saveState() }),
      label('Slideshow pause ms'),
      input(app.settings.slideshowPause, function (value) { app.settings.slideshowPause = value; saveState() }),
      label('404 retry delay ms'),
      input(app.settings.autoDelay, function (value) { app.settings.autoDelay = value; saveState() }),
      createEl('label', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          marginTop: '8px'
        }
      }, [
        createEl('input', {
          type: 'checkbox',
          checked: app.settings.autoAdvanceOn404,
          onchange: function (event) {
            app.settings.autoAdvanceOn404 = event.target.checked
            if (!event.target.checked) app.auto404Remaining = null
            saveState()
          }
        }),
        'auto advance/decrement on 404'
      ]),
      label('404 retry count (0 = until next load)'),
      input(app.settings.auto404Count, function (value) { app.settings.auto404Count = value; saveState() }),
      label('LLM endpoint'),
      input(app.settings.llmEndpoint || LLM_DEFAULT_ENDPOINT, function (value) {
        app.settings.llmEndpoint = value.trim()
        saveState()
      }),
      label('LLM model'),
      input(app.settings.llmModel || LLM_DEFAULT_MODEL, function (value) {
        app.settings.llmModel = value.trim()
        saveState()
      }),
      label('LLM max tokens'),
      input(String(app.settings.llmMaxTokens || LLM_DEFAULT_MAX_TOKENS), function (value) {
        app.settings.llmMaxTokens = value
        saveState()
      }),
      createEl('label', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          marginTop: '8px'
        }
      }, [
        createEl('input', {
          type: 'checkbox',
          checked: app.settings.autoDownload,
          onchange: function (event) {
            app.settings.autoDownload = event.target.checked
            saveState()
          }
        }),
        'auto-download successful load'
      ]),
      createEl('label', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          marginTop: '8px'
        }
      }, [
        createEl('input', {
          type: 'checkbox',
          checked: app.settings.autoFetchOnQueryChange,
          onchange: function (event) {
            app.settings.autoFetchOnQueryChange = event.target.checked
            saveState()
          }
        }),
        'auto-fetch title+description on query change'
      ]),
      createEl('label', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          marginTop: '8px'
        }
      }, [
        createEl('input', {
          type: 'checkbox',
          checked: app.settings.autoFetchTitleOnLoad,
          onchange: function (event) {
            app.settings.autoFetchTitleOnLoad = event.target.checked
            saveState()
          }
        }),
        'auto-fetch title on load'
      ]),
      createEl('label', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          marginTop: '8px'
        }
      }, [
        createEl('input', {
          type: 'checkbox',
          checked: app.settings.autoFetchDescriptionOnPreload,
          onchange: function (event) {
            app.settings.autoFetchDescriptionOnPreload = event.target.checked
            saveState()
          }
        }),
        'auto-fetch description on preload/load'
      ]),
      createEl('label', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          marginTop: '8px'
        }
      }, [
        createEl('input', {
          type: 'checkbox',
          checked: app.settings.previewReplacesStyling === true,
          onchange: function (event) {
            app.settings.previewReplacesStyling = event.target.checked
            saveState()
            styleTargetImage()
          }
        }),
        'replace page/image styling for preview'
      ]),
      createEl('div', {
        text: 'Clicking page images only adds to history.',
        style: {
          color: '#999',
          font: '11px system-ui, sans-serif',
          marginTop: '4px'
        }
      }),
      createEl('label', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          marginTop: '8px'
        }
      }, [
        createEl('input', {
          type: 'checkbox',
          checked: app.settings.showHistoryThumbnails !== false,
          onchange: function (event) {
            app.settings.showHistoryThumbnails = event.target.checked
            saveState()
            renderHistory()
          }
        }),
        'show history thumbnails'
      ]),
      createEl('div', {
        style: {
          display: 'flex',
          gap: '6px',
          flexWrap: 'wrap',
          marginTop: '8px'
        }
      }, [
        button('Back', function () { moveActiveField('down') }),
        button('Forward', function () { moveActiveField('up') }),
        button('Slideshow', startSlideshow),
        button('Stop', function () { stopSlideshow() }),
        button('Fetch Title', fetchTitleForCurrentImage),
        button('Fetch Description', fetchDescriptionForCurrentImage),
        button('Download', downloadCurrentImage)
      ])
    ]
  }

  function renderStyleControls () {
    var fit = createEl('select', {
      onchange: function (event) {
        app.settings.imageObjectFit = event.target.value
        saveState()
        styleTargetImage()
      },
      style: {
        width: '100%',
        background: '#111',
        color: '#fff',
        border: '1px solid #555',
        borderRadius: '4px',
        padding: '4px'
      }
    }, ['contain', 'cover', 'fill', 'scale-down', 'none'].map(function (value) {
      return createEl('option', {
        value: value,
        text: value,
        selected: app.settings.imageObjectFit === value
      })
    }))

    return [
      label('Object fit'),
      fit,
      label('Background'),
      input(app.settings.pageBackground, function (value) {
        app.settings.pageBackground = value
        saveState()
        styleTargetImage()
      }),
      label('Image width'),
      input(app.settings.imageWidth, function (value) {
        app.settings.imageWidth = value
        saveState()
        styleTargetImage()
      }),
      label('Image height'),
      input(app.settings.imageHeight, function (value) {
        app.settings.imageHeight = value
        saveState()
        styleTargetImage()
      })
    ]
  }

  function renderFields () {
    if (!app.fieldsEl) return

    app.fieldsEl.innerHTML = ''

    if (!app.fields.length) {
      app.fieldsEl.appendChild(createEl('div', { text: 'No editable fields found.' }))
      return
    }

    var multiSelectCount = app.selectedHistoryUrls.length
    if (multiSelectCount > 1) {
      app.fieldsEl.appendChild(createEl('div', {
        text: multiSelectCount + ' history items selected — field edits will apply to all',
        style: {
          background: 'rgba(90,180,100,0.15)',
          border: '1px solid rgba(90,180,100,0.4)',
          borderRadius: '4px',
          color: '#9d9',
          font: '11px system-ui, sans-serif',
          padding: '5px 7px',
          marginBottom: '8px'
        }
      }))
    }

    app.fields.forEach(function (field, index) {
      var row = createEl('div', {
        style: {
          border: field.id === app.activeFieldId ? '1px solid #9ee' : '1px solid rgba(255,255,255,0.16)',
          background: field.id === app.activeFieldId ? 'rgba(90,180,200,0.18)' : 'rgba(255,255,255,0.04)',
          borderRadius: '5px',
          padding: '6px',
          marginBottom: '6px',
          cursor: 'pointer'
        },
        onclick: function (event) {
          if (isTypingTarget(event.target)) return
          setActiveField(field.id)
        }
      })

      var shortcutKey = fieldShortcutKey(index)
      var keyLabel = shortcutKey ? ' [' + shortcutKey + ']' : ''
      row.appendChild(createEl('div', {
        text: field.label + keyLabel + ' · ' + field.kind,
        style: {
          color: '#ccc',
          font: '11px system-ui, sans-serif',
          marginBottom: '4px'
        }
      }))

      row.appendChild(input(getFieldValue(field), function (value) {
        setActiveField(field.id, false)
        setFieldValue(field, value)
        syncFullUrlOnly()
      }, null, function () {
        applyFieldChangeToSelectedHistory(field)
      }))

      var controlRow = createEl('div', {
        style: {
          display: 'flex',
          gap: '5px',
          alignItems: 'center',
          marginTop: '5px'
        }
      })

      if (field.kind === 'int' || field.kind === 'hex') {
        controlRow.appendChild(button('-', function () {
          setActiveField(field.id, false)
          bumpField(field, -getStep())
          applyCurrentUrl()
          applyFieldChangeToSelectedHistory(field)
        }))

        controlRow.appendChild(button('+', function () {
          setActiveField(field.id, false)
          bumpField(field, getStep())
          applyCurrentUrl()
          applyFieldChangeToSelectedHistory(field)
        }))

        controlRow.appendChild(createEl('span', {
          text: 'width',
          style: {
            color: '#aaa',
            marginLeft: '4px'
          }
        }))

        controlRow.appendChild(input(String(field.width || ''), function (value) {
          var width = parseInt(value, 10)
          if (Number.isFinite(width) && width >= 0) {
            field.width = width
            field.token.width = width
            syncFullUrlOnly()
          }
        }, {
          width: '58px'
        }))
      }

      controlRow.appendChild(button('select', function () {
        setActiveField(field.id)
      }))

      row.appendChild(controlRow)
      app.fieldsEl.appendChild(row)
    })
  }

  function setActiveField (id, shouldRender) {
    if (!app.fieldIndex[id]) return

    app.activeFieldId = id
    saveState()

    if (shouldRender !== false) renderFields()
  }

  function getVisibleHistoryEntries () {
    return (app.settings.history || []).slice(0, 30)
  }

  function getHistoryIndexByUrl (url) {
    if (!url) return -1
    var entries = getVisibleHistoryEntries()
    for (var i = 0; i < entries.length; i += 1) {
      if (entries[i].url === url) return i
    }
    return -1
  }

  function normalizeHistorySelection () {
    var entries = getVisibleHistoryEntries()
    var allowed = Object.create(null)
    entries.forEach(function (entry) {
      allowed[entry.url] = true
    })

    app.selectedHistoryUrls = (app.selectedHistoryUrls || []).filter(function (url) {
      return !!allowed[url]
    })

    if (app.historyFocusedUrl && !allowed[app.historyFocusedUrl]) {
      app.historyFocusedUrl = ''
    }

    if (!app.historyFocusedUrl && app.selectedHistoryUrls.length) {
      app.historyFocusedUrl = app.selectedHistoryUrls[app.selectedHistoryUrls.length - 1]
    }

    if (!app.historySelectionAnchorUrl || !allowed[app.historySelectionAnchorUrl]) {
      app.historySelectionAnchorUrl = app.historyFocusedUrl || ''
    }
  }

  function setHistorySelectionByIndex (index, options) {
    var entries = getVisibleHistoryEntries()
    if (!entries.length) {
      app.selectedHistoryUrls = []
      app.historyFocusedUrl = ''
      app.historySelectionAnchorUrl = ''
      return
    }

    options = options || {}
    var clampedIndex = Math.max(0, Math.min(entries.length - 1, index))
    var focusUrl = entries[clampedIndex].url
    var nextSelection = []

    if (options.range) {
      var anchorIndex = getHistoryIndexByUrl(app.historySelectionAnchorUrl)
      if (anchorIndex < 0) anchorIndex = clampedIndex
      var start = Math.min(anchorIndex, clampedIndex)
      var end = Math.max(anchorIndex, clampedIndex)
      nextSelection = entries.slice(start, end + 1).map(function (entry) { return entry.url })
    } else if (options.toggle) {
      var selectedMap = Object.create(null)
      ;(app.selectedHistoryUrls || []).forEach(function (url) {
        selectedMap[url] = true
      })

      if (selectedMap[focusUrl]) delete selectedMap[focusUrl]
      else selectedMap[focusUrl] = true

      nextSelection = entries
        .map(function (entry) { return entry.url })
        .filter(function (url) { return !!selectedMap[url] })
      app.historySelectionAnchorUrl = focusUrl
    } else {
      nextSelection = [focusUrl]
      app.historySelectionAnchorUrl = focusUrl
    }

    app.selectedHistoryUrls = nextSelection
    app.historyFocusedUrl = focusUrl
  }

  function moveHistorySelection (direction) {
    var entries = getVisibleHistoryEntries()
    if (!entries.length) return false

    normalizeHistorySelection()
    var currentIndex = getHistoryIndexByUrl(app.historyFocusedUrl)
    if (currentIndex < 0) {
      currentIndex = direction > 0 ? -1 : entries.length
    }

    var nextIndex = Math.max(0, Math.min(entries.length - 1, currentIndex + direction))
    setHistorySelectionByIndex(nextIndex)
    renderHistory()
    return true
  }

  function loadSelectedHistoryItem () {
    normalizeHistorySelection()
    if (!app.selectedHistoryUrls.length) return false

    var url = app.historyFocusedUrl && app.selectedHistoryUrls.indexOf(app.historyFocusedUrl) >= 0
      ? app.historyFocusedUrl
      : app.selectedHistoryUrls[0]
    if (!url) return false

    parseAndApplyUrl(url)
    return true
  }

  function downloadHistoryItemViaCanvas (url) {
    if (!url) return Promise.resolve(false)
    var filename = ensureFilenameExtension(deriveTitle(url) || 'image', url)
    return new Promise(function (resolve) {
      var img = new window.Image()
      img.crossOrigin = 'anonymous'
      img.onload = function () {
        try {
          var canvas = document.createElement('canvas')
          canvas.width = img.naturalWidth
          canvas.height = img.naturalHeight
          canvas.getContext('2d').drawImage(img, 0, 0)
          canvas.toBlob(function (blob) {
            if (!blob) { resolve(false); return }
            var a = document.createElement('a')
            a.href = URL.createObjectURL(blob)
            a.download = filename
            a.click()
            if (!(app.settings.history || []).some(function (entry) { return entry.url === url })) addHistory(url)
            updateHistoryForUrl(url, { downloadedAt: new Date().toISOString(), title: filename })
            setStatus('download requested: ' + filename)
            resolve(true)
          })
        } catch (e) {
          setStatus('download failed (cross-origin blocked): ' + filename)
          resolve(false)
        }
      }
      img.onerror = function () {
        setStatus('download failed (image load error): ' + filename)
        resolve(false)
      }
      img.src = url
    })
  }

  function downloadSelectedHistoryItems () {
    normalizeHistorySelection()
    var urls = (app.selectedHistoryUrls || []).slice()
    if (!urls.length) return false

    if (urls.length === 1) {
      downloadImageByUrl(urls[0])
      return true
    }

    var requestedCount = 0
    var blockedCount = 0
    var run = Promise.resolve()
    urls.forEach(function (url) {
      run = run.then(function () {
        return downloadImageByUrl(url).then(function (ok) {
          if (ok) requestedCount += 1
          else blockedCount += 1
          return null
        })
      })
    })

    run.then(function () {
      if (requestedCount > 0) {
        setStatus(
          'download requested for ' + requestedCount + ' selected history item(s)' +
          (blockedCount ? ' (' + blockedCount + ' blocked/skipped)' : '')
        )
        return
      }
      setStatus('no selected history items downloaded (blocked/skipped)')
    })
    return true
  }

  function syncFullUrlOnly () {
    if (!app.model) return
    var url = rebuildUrl(app.model)
    if (app.fullUrlEl) app.fullUrlEl.value = url
    renderTitleForCurrentUrl()
    renderDescriptionForCurrentUrl()
  }

  function renderHistory () {
    if (!app.historyEl) return

    app.historyEl.innerHTML = ''

    var gridStyle = {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: '6px',
      marginBottom: '6px'
    }
    var btnStyle = { width: '100%' }

    app.historyEl.appendChild(createEl('div', { style: Object.assign({}, gridStyle, { gridTemplateColumns: 'repeat(2, 1fr)' }) }, [
      button('Clear Downloads', function () {
        app.settings.downloadRecords = []
        app.settings.history = (app.settings.history || []).map(function (item) {
          return Object.assign({}, item, { downloadedAt: '' })
        })
        saveState()
        renderHistory()
        setStatus('download records cleared')
      }, btnStyle),
      button('Clear History', function () {
        app.settings.history = []
        app.selectedHistoryUrls = []
        app.historyFocusedUrl = ''
        app.historySelectionAnchorUrl = ''
        saveState()
        renderHistory()
      }, btnStyle),
      button('Import History', function () {
        var fileInput = document.createElement('input')
        fileInput.type = 'file'
        fileInput.accept = '.json,application/json'
        fileInput.onchange = function () {
          var file = fileInput.files && fileInput.files[0]
          if (!file) return
          var reader = new FileReader()
          reader.onload = function (e) {
            try {
              var parsed = JSON.parse(e.target.result)
              var imported = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.history) ? parsed.history : null)
              if (!imported) throw new Error('not an array')
              var existingUrls = Object.create(null)
              ;(app.settings.history || []).forEach(function (item) {
                if (item && item.url) existingUrls[item.url] = true
              })
              var added = 0
              var newUrlsWithoutThumbnail = []
              imported.forEach(function (item) {
                if (!item || !item.url || existingUrls[item.url]) return
                app.settings.history.push(item)
                existingUrls[item.url] = true
                added++
                if (!item.thumbnail) newUrlsWithoutThumbnail.push(item.url)
              })
              app.settings.history = app.settings.history.slice()
              saveState()
              renderHistory()
              setStatus('imported ' + added + ' history item' + (added === 1 ? '' : 's'))
              if (app.settings.showHistoryThumbnails !== false && newUrlsWithoutThumbnail.length) {
                var visibleUrls = Object.create(null)
                getVisibleHistoryEntries().forEach(function (entry) { visibleUrls[entry.url] = true })
                var visibleWithoutThumbnail = newUrlsWithoutThumbnail.filter(function (url) { return visibleUrls[url] })
                var thumbnailChain = Promise.resolve()
                visibleWithoutThumbnail.forEach(function (url) {
                  thumbnailChain = thumbnailChain.then(function () {
                    return ensureThumbnailForUrl(url).catch(function () {})
                  })
                })
              }
            } catch (err) {
              setStatus('import failed: invalid JSON')
            }
          }
          reader.readAsText(file)
        }
        document.body.appendChild(fileInput)
        fileInput.click()
        fileInput.remove()
      }, btnStyle),
      button('Export History', function () {
        var json = JSON.stringify(app.settings.history || [], null, 2)
        var blob = new Blob([json], { type: 'application/json' })
        var a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = 'history-' + new Date().toISOString().slice(0, 10) + '.json'
        a.rel = 'noopener'
        document.body.appendChild(a)
        a.click()
        a.remove()
        setStatus('history exported')
      }, btnStyle)
    ]))

    app.historyEl.appendChild(createEl('div', { style: gridStyle }, [
      button('Favorite Current', function () {
        var current = ''
        if (app.fullUrlEl) current = app.fullUrlEl.value
        else if (app.model) current = rebuildUrl(app.model)
        if (!current) {
          setStatus('no current URL to favorite')
          return
        }
        addFavorite(current)
        renderFavorites()
        setStatus('favorite added')
      }, btnStyle),
      button('Import Favorites', function () {
        var input = document.createElement('input')
        input.type = 'file'
        input.accept = '.json,application/json'
        input.onchange = function () {
          var file = input.files && input.files[0]
          if (!file) return
          var reader = new FileReader()
          reader.onload = function (e) {
            try {
              var parsed = JSON.parse(e.target.result)
              var imported = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.favorites) ? parsed.favorites : null)
              if (!imported) throw new Error('not an array')
              var existingUrls = Object.create(null)
              ;(app.settings.favorites || []).forEach(function (item) {
                if (item && item.url) existingUrls[item.url] = true
              })
              var added = 0
              imported.forEach(function (item) {
                if (!item || !item.url || existingUrls[item.url]) return
                app.settings.favorites.push(item)
                existingUrls[item.url] = true
                added++
              })
              app.settings.favorites = app.settings.favorites.slice()
              saveState()
              renderFavorites()
              setStatus('imported ' + added + ' favorite(s)')
            } catch (err) {
              setStatus('import failed: invalid JSON')
            }
          }
          reader.readAsText(file)
        }
        document.body.appendChild(input)
        input.click()
        input.remove()
      }, btnStyle),
      button('Export Favorites', function () {
        saveFavoritesFile()
      }, btnStyle)
    ]))

    app.historyEl.appendChild(createEl('div', { style: { marginBottom: '6px' } }, [
      button('Clear Storage', function () {
        if (!window.confirm('Clear all history, favorites, and settings from localStorage? This cannot be undone.')) return
        try {
          window.localStorage.removeItem(STORE_KEY)
          app.settings = defaultState()
          saveState()
          renderHistory()
          setStatus('storage cleared')
        } catch (err) {
          setStatus('clear failed')
        }
      }, { width: '100%' })
    ]))

    if (!app.settings.history.length) {
      app.historyEl.appendChild(createEl('div', { text: 'No history yet.' }))
      return
    }

    normalizeHistorySelection()
    var selectedMap = Object.create(null)
    ;(app.selectedHistoryUrls || []).forEach(function (url) {
      selectedMap[url] = true
    })

    var showThumbnails = app.settings.showHistoryThumbnails !== false
    getVisibleHistoryEntries().forEach(function (item, historyIndex) {
      var isSelected = !!selectedMap[item.url]
      var isFocused = app.historyFocusedUrl === item.url
      var row = createEl('div', {
        style: {
          display: 'grid',
          gridTemplateColumns: showThumbnails
            ? (HISTORY_THUMBNAIL_SIZE + 6) + 'px 1fr auto'
            : '1fr auto',
          gap: '5px',
          alignItems: 'center',
          borderTop: '1px solid rgba(255,255,255,0.12)',
          borderLeft: isSelected ? '2px solid #8fd' : '2px solid transparent',
          padding: '5px 0 5px 4px',
          background: isSelected ? 'rgba(143,255,221,0.12)' : 'transparent'
        }
      })

      if (showThumbnails) {
        if (item.thumbnail) {
          row.appendChild(createEl('img', {
            src: item.thumbnail,
            alt: 'history thumbnail',
            style: {
              width: HISTORY_THUMBNAIL_SIZE + 'px',
              height: HISTORY_THUMBNAIL_SIZE + 'px',
              objectFit: 'cover',
              borderRadius: '4px',
              border: '1px solid rgba(255,255,255,0.2)',
              background: '#111'
            }
          }))
        } else {
          row.appendChild(createEl('div', {
            style: {
              width: HISTORY_THUMBNAIL_SIZE + 'px',
              height: HISTORY_THUMBNAIL_SIZE + 'px',
              borderRadius: '4px',
              border: '1px solid rgba(255,255,255,0.2)',
              background: '#111'
            }
          }))
        }
      }

      row.appendChild(createEl('button', {
        type: 'button',
        text: item.title || item.label || item.url,
        title: item.url,
        onkeydown: function (event) {
          if (!event || event.key !== 'Enter' || !event.shiftKey) return
          event.preventDefault()
          event.stopPropagation()

          if (app.selectedHistoryUrls.indexOf(item.url) < 0) {
            setHistorySelectionByIndex(historyIndex)
          }
          downloadSelectedHistoryItems()
        },
        onclick: function (event) {
          if (event) {
            event.preventDefault()
            event.stopPropagation()
          }

          if (event && event.shiftKey) {
            setHistorySelectionByIndex(historyIndex, { range: true })
          } else if (event && (event.metaKey || event.ctrlKey)) {
            setHistorySelectionByIndex(historyIndex, { toggle: true })
          } else {
            setHistorySelectionByIndex(historyIndex)
            if (app.settings.previewReplacesStyling) {
              parseAndApplyUrl(item.url)
              return
            }
          }
          renderHistory()
        },
        ondblclick: function (event) {
          if (event) {
            event.preventDefault()
            event.stopPropagation()
          }
          setHistorySelectionByIndex(historyIndex)
          parseAndApplyUrl(item.url)
        },
        style: {
          textAlign: 'left',
          background: 'transparent',
          color: isSelected ? '#eafff6' : '#ddd',
          border: '0',
          padding: '2px',
          overflowWrap: 'anywhere',
          cursor: 'pointer',
          font: '11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          outline: isFocused ? '1px dotted rgba(143,255,221,0.8)' : 'none'
        }
      }))

      var rightControls = createEl('div', {
        style: {
          display: 'flex',
          gap: '4px',
          alignItems: 'center',
          justifySelf: 'end'
        }
      })

      if (item.downloadedAt) {
        rightControls.appendChild(createEl('span', {
          text: 'downloaded',
          title: 'Downloaded at ' + item.downloadedAt,
          style: {
            font: '10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            color: '#8fd',
            border: '1px solid rgba(143,255,221,0.45)',
            borderRadius: '999px',
            padding: '1px 6px',
            whiteSpace: 'nowrap'
          }
        }))
      }

      rightControls.appendChild(button('x', function () {
        app.settings.history = app.settings.history.filter(function (entry) {
          return entry.url !== item.url
        })
        saveState()
        renderHistory()
      }))

      row.appendChild(rightControls)

      app.historyEl.appendChild(row)
    })
  }

  function renderFavorites () {
    if (!app.favoritesEl) return

    app.favoritesEl.innerHTML = ''
    var favorites = app.settings.favorites || []

    if (!favorites.length) {
      app.favoritesEl.appendChild(createEl('div', { text: 'No favorites yet.' }))
      return
    }

    favorites.slice(0, 30).forEach(function (item) {
      var row = createEl('div', {
        style: {
          display: 'grid',
          gridTemplateColumns: (FAVORITE_THUMBNAIL_SIZE + 6) + 'px 1fr auto',
          gap: '6px',
          alignItems: 'center',
          borderTop: '1px solid rgba(255,255,255,0.12)',
          padding: '6px 0'
        }
      })

      if (item.thumbnail) {
        row.appendChild(createEl('img', {
          src: item.thumbnail,
          alt: 'favorite thumbnail',
          style: {
            width: FAVORITE_THUMBNAIL_SIZE + 'px',
            height: FAVORITE_THUMBNAIL_SIZE + 'px',
            objectFit: 'cover',
            borderRadius: '4px',
            border: '1px solid rgba(255,255,255,0.2)',
            background: '#111'
          }
        }))
      } else {
        row.appendChild(createEl('div', {
          style: {
            width: FAVORITE_THUMBNAIL_SIZE + 'px',
            height: FAVORITE_THUMBNAIL_SIZE + 'px',
            borderRadius: '4px',
            border: '1px solid rgba(255,255,255,0.2)',
            background: '#111'
          }
        }))
      }

      row.appendChild(createEl('button', {
        type: 'button',
        text: item.title || item.label || item.url,
        title: item.url,
        onclick: function () { parseAndApplyUrl(item.url) },
        style: {
          textAlign: 'left',
          background: 'transparent',
          color: '#ddd',
          border: '0',
          padding: '2px',
          overflowWrap: 'anywhere',
          cursor: 'pointer',
          font: '11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
        }
      }))

      row.appendChild(button('x', function () {
        app.settings.favorites = app.settings.favorites.filter(function (entry) {
          return entry.url !== item.url
        })
        saveState()
        renderFavorites()
      }))

      app.favoritesEl.appendChild(row)
    })
  }

  function renderAll () {
    if (!app.panel) renderPanel()
    if (app.fullUrlEl && app.model) app.fullUrlEl.value = rebuildUrl(app.model)
    if (app.domainEl && app.model) app.domainEl.value = app.model.host
    renderTitleForCurrentUrl()
    renderDescriptionForCurrentUrl()
    renderFields()
    renderFavorites()
    renderHistory()
  }

  function isTypingTarget (target) {
    if (!target) return false

    var tag = target.tagName && target.tagName.toLowerCase()
    return tag === 'input' ||
      tag === 'textarea' ||
      tag === 'select' ||
      target.isContentEditable
  }

  function findImageFromTarget (target) {
    var node = target
    while (node && node !== document && node !== document.documentElement) {
      if (node.tagName && node.tagName.toLowerCase() === 'img') return node
      node = node.parentNode
    }
    return null
  }

  function onDocumentClick (event) {
    if (!event || !event.target) return
    if (app.panel && app.panel.contains(event.target)) return

    var clickedImage = findImageFromTarget(event.target)
    if (!clickedImage) return

    var url = getImageUrl(clickedImage)
    if (!url) return

    event.preventDefault()
    event.stopPropagation()

    addHistory(url)
    renderHistory()
    app.pendingHistoryUrl = ''
    setStatus('selected image added to history')
  }

  function onKeyDown (event) {
    if (event.key === 'Enter') {
      if (!isTypingTarget(event.target) && (app.selectedHistoryUrls || []).length) {
        event.preventDefault()
        event.stopPropagation()
        if (event.shiftKey) downloadSelectedHistoryItems()
        else loadSelectedHistoryItem()
        return
      }
    }

    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      if (!isTypingTarget(event.target) && (app.selectedHistoryUrls || []).length) {
        event.preventDefault()
        event.stopPropagation()
        moveHistorySelection(event.key === 'ArrowDown' ? 1 : -1)
        return
      }
    }

    if (isTypingTarget(event.target)) return

    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      moveActiveField('down')
      return
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault()
      moveActiveField('up')
      return
    }

    if (event.key === ' ') {
      event.preventDefault()
      if (app.autoRunning) stopSlideshow()
      else moveActiveField(app.settings.direction || 'up')
      return
    }

    if (event.key === 'ArrowDown' || event.key.toLowerCase() === 'd') {
      event.preventDefault()
      downloadCurrentImage()
      return
    }

    var lower = event.key.toLowerCase()
    if (lower === 'h') {
      event.preventDefault()
      setPanelHidden(!app.panelHidden)
      return
    }

    if (/^[a-z]$/.test(lower)) {
      var index = fieldIndexForShortcutKey(lower)
      if (index >= 0 && app.fields[index]) {
        event.preventDefault()
        setActiveField(app.fields[index].id)
      }
    }
  }

  function rememberOriginalState () {
    app.original.htmlCssText = document.documentElement.style.cssText
    app.original.bodyCssText = document.body.style.cssText

    if (app.targetImg) {
      app.original.imgCssText = app.targetImg.style.cssText
      app.original.imgSrc = app.targetImg.getAttribute('src') || ''
      app.original.imgSrcset = app.targetImg.getAttribute('srcset') || ''
      app.original.imgSizes = app.targetImg.getAttribute('sizes') || ''
    }
  }

  function restoreOriginalState () {
    document.documentElement.style.cssText = app.original.htmlCssText
    document.body.style.cssText = app.original.bodyCssText

    if (app.targetImg) {
      app.targetImg.style.cssText = app.original.imgCssText

      if (app.original.imgSrcset) app.targetImg.setAttribute('srcset', app.original.imgSrcset)
      if (app.original.imgSizes) app.targetImg.setAttribute('sizes', app.original.imgSizes)
    }
  }

  function destroy () {
    stopSlideshow('closed')

    app.cleanupFns.forEach(function (fn) {
      try {
        fn()
      } catch (err) {
        console.warn('[img-nav] cleanup failed', err)
      }
    })

    if (app.panel) app.panel.remove()
    restoreOriginalState()
    delete window[APP_ID]
  }

  app.destroy = destroy

  function init () {
    app.targetImg = findTargetImage()
    rememberOriginalState()

    app.targetImg.addEventListener('load', onImageLoad, true)
    app.targetImg.addEventListener('error', onImageError, true)
    app.cleanupFns.push(function () {
      app.targetImg.removeEventListener('load', onImageLoad, true)
      app.targetImg.removeEventListener('error', onImageError, true)
    })

    document.addEventListener('keydown', onKeyDown, true)
    app.cleanupFns.push(function () {
      document.removeEventListener('keydown', onKeyDown, true)
    })

    document.addEventListener('click', onDocumentClick, true)
    app.cleanupFns.push(function () {
      document.removeEventListener('click', onDocumentClick, true)
    })

    var initialUrl = location.href

    try {
      app.model = parseModel(initialUrl)
      app.activeFieldId = ''
      collectFields(app.model)
      renderPanel()
      styleTargetImage()
      syncFullUrlOnly()
      setStatus('ready')
    } catch (err) {
      renderPanel()
      setStatus(err.message || 'invalid URL')
    }
  }

  init()
})()
