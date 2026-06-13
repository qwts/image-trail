/* global window, document, location, history, localStorage, URL, setTimeout, clearTimeout */
/* global console, fetch, FileReader */
(function () {
  'use strict'

  var APP_ID = '__image_url_token_editor_bookmarklet_v1'
  var STORE_KEY = '__url_image_navigator_state_v1'
  var MAX_HISTORY = 100
  var MAX_Z_INDEX = 2147483647
  var LLM_DEFAULT_ENDPOINT = 'http://127.0.0.1:1234/v1/chat/completions'
  var LLM_DEFAULT_MODEL = 'gemma-4-e4b'
  var LLM_DEFAULT_MAX_TOKENS = 220

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
    llmCache: Object.create(null),
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
      llmEndpoint: LLM_DEFAULT_ENDPOINT,
      llmModel: LLM_DEFAULT_MODEL,
      llmMaxTokens: String(LLM_DEFAULT_MAX_TOKENS),
      pageBackground: '#000000',
      imageObjectFit: 'contain',
      imageWidth: '100vw',
      imageHeight: '100vh',
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

  function llmSchema () {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['filename', 'description'],
      properties: {
        filename: {
          type: 'string',
          description: 'Concise descriptive filename without extension.'
        },
        description: {
          type: 'string',
          description: 'One concise sentence describing visible image content.'
        }
      }
    }
  }

  function describeImageWithLlm (imageInput, sourceUrl) {
    var endpoint = app.settings.llmEndpoint || LLM_DEFAULT_ENDPOINT
    var model = app.settings.llmModel || LLM_DEFAULT_MODEL
    var maxTokens = parseInt(app.settings.llmMaxTokens, 10)
    if (!Number.isFinite(maxTokens) || maxTokens <= 0) maxTokens = LLM_DEFAULT_MAX_TOKENS

    var payload = {
      model: model,
      temperature: 0,
      max_tokens: maxTokens,
      stream: false,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'image_download_metadata',
          strict: true,
          schema: llmSchema()
        }
      },
      messages: [
        {
          role: 'system',
          content: 'Return only valid JSON matching the schema.'
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: [
                'Create metadata for this image download.',
                'Rules:',
                '- filename: short snake_case filename without extension',
                '- description: one concise sentence describing visible content',
                '- avoid vague words like image, photo, pic',
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
      var filename = sanitizeFilename(parsed.filename)
      var description = String(parsed.description || '').trim()

      if (!filename) filename = sanitizeFilename(deriveTitle(sourceUrl)) || 'image'
      if (!description) description = 'No model description returned.'

      return {
        filename: filename,
        description: description
      }
    })
  }

  function setDescriptionForUrl (url, metadata) {
    if (!url || !metadata) return
    app.llmCache[url] = {
      filename: metadata.filename || '',
      description: metadata.description || ''
    }
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
      app.descriptionEl.textContent = 'No description yet. Download to generate one.'
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
    var next

    if (field.kind === 'hex') {
      var hasPrefix = /^0x/i.test(current)
      var body = current.replace(/^0x/i, '')
      var upper = /[A-F]/.test(body)
      var value = parseInt(body || '0', 16)
      var bumped = Math.max(0, value + delta)
      var nextBody = bumped.toString(16)
      if (upper) nextBody = nextBody.toUpperCase()
      nextBody = padNumberText(nextBody, width)
      next = hasPrefix ? '0x' + nextBody : nextBody
    } else {
      var intValue = parseInt(current || '0', 10)
      next = padNumberText(String(Math.max(0, intValue + delta)), width)
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
    if (app.titleEl) app.titleEl.textContent = deriveLabel(url)

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

    var existing = app.settings.history.filter(function (item) {
      return item.url !== url
    })

    existing.unshift({
      url: url,
      timestamp: new Date().toISOString(),
      title: deriveTitle(url),
      label: deriveLabel(url)
    })

    app.settings.history = existing.slice(0, MAX_HISTORY)
    saveState()
  }

  function addFavorite (url) {
    if (!url) return

    var existing = app.settings.favorites.filter(function (item) {
      return item.url !== url
    })

    existing.unshift({
      url: url,
      timestamp: new Date().toISOString(),
      title: deriveTitle(url),
      label: deriveLabel(url)
    })

    app.settings.favorites = existing.slice(0, MAX_HISTORY)
    saveState()
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

  function downloadCurrentImage () {
    var url = app.fullUrlEl ? app.fullUrlEl.value : app.lastAppliedUrl
    if (!url) return

    var metadata = app.llmCache[url] || {}
    var filename = ensureFilenameExtension(
      metadata.filename || deriveTitle(url) || 'image',
      url
    )

    var anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.rel = 'noopener'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()

    if (metadata.filename) {
      setStatus('download requested: ' + filename)
    } else {
      setStatus('download requested (fallback name; click Fetch Name+Desc first)')
    }
  }

  function fetchNameAndDescriptionForCurrentImage () {
    var url = app.fullUrlEl ? app.fullUrlEl.value : app.lastAppliedUrl
    if (!url) return

    var llmEndpoint = app.settings.llmEndpoint || LLM_DEFAULT_ENDPOINT
    setStatus('asking LLM for filename + description...')

    fetchImageBlob(url).then(function (blob) {
      return toDataUrl(blob).then(function (dataUrl) {
        return describeImageWithLlm(dataUrl, url)
      })
    })
      .catch(function () {
        return describeImageWithLlm(url, url)
      })
      .then(function (metadata) {
        var filename = ensureFilenameExtension(metadata.filename || deriveTitle(url) || 'image', url)
        var description = String(metadata.description || '').trim() || 'No description available.'

        setDescriptionForUrl(url, {
          filename: filename,
          description: description
        })
        renderDescriptionForCurrentUrl()
        setStatus('LLM metadata ready: ' + filename)
      })
      .catch(function (err) {
        console.warn('[img-nav] llm naming failed', err)
        setStatus(
          'LLM failed (' + summarizeError(err) + ') via ' + llmEndpoint
        )
      })
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
      img.onload = null
      img.src = url
    }

    tryNext()
    return img
  }

  function triggerPreloads () {
    var maxAttempts = Math.max(1, parseInt(app.settings.autoCount, 10) || 10)
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
    setStatus('loaded (click Fetch Name+Desc to run LLM)')
    app.auto404Remaining = null

    if (app.pendingHistoryUrl) {
      addHistory(app.pendingHistoryUrl)
      app.pendingHistoryUrl = ''
      renderHistory()
    }

    if (app.settings.autoDownload) downloadCurrentImage()
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

  function button (label, onClick) {
    return createEl('button', {
      type: 'button',
      text: label,
      onclick: onClick,
      style: {
        background: '#222',
        color: '#fff',
        border: '1px solid #666',
        borderRadius: '4px',
        padding: '5px 8px',
        cursor: 'pointer',
        font: '12px system-ui, sans-serif'
      }
    })
  }

  function input (value, onInput, extraStyle) {
    return createEl('input', {
      value: value == null ? '' : value,
      oninput: function (event) {
        onInput(event.target.value, event)
      },
      onkeydown: function (event) {
        if (event.key === 'Enter') {
          event.target.blur()
          applyCurrentUrl()
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

  function section (title, children) {
    return createEl('div', {
      style: {
        borderTop: '1px solid rgba(255,255,255,0.16)',
        marginTop: '10px',
        paddingTop: '8px'
      }
    }, [
      createEl('div', {
        text: title,
        style: {
          font: '700 12px system-ui, sans-serif',
          marginBottom: '6px',
          color: '#fff'
        }
      })
    ].concat(children || []))
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
    })

    app.fieldsEl = createEl('div')
    app.historyEl = createEl('div')
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
      text: deriveLabel(app.model ? rebuildUrl(app.model) : location.href),
      style: {
        font: '700 14px system-ui, sans-serif',
        marginBottom: '4px',
        wordBreak: 'break-word'
      }
    })

    app.panel.appendChild(app.titleEl)
    app.panel.appendChild(section('Image Description', [app.descriptionEl]))

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
    ]))

    app.panel.appendChild(section('Domain', [app.domainEl]))
    app.panel.appendChild(section('Fields', [app.fieldsEl]))
    app.panel.appendChild(section('Controls', renderControls()))
    app.panel.appendChild(section('Styling', renderStyleControls()))
    app.panel.appendChild(section('History', [app.historyEl]))

    document.body.appendChild(app.panel)
    if (app.panelHidden) app.panel.style.display = 'none'
    renderFields()
    renderHistory()
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
        button('Fetch Name+Desc', fetchNameAndDescriptionForCurrentImage),
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
        }))

        controlRow.appendChild(button('+', function () {
          setActiveField(field.id, false)
          bumpField(field, getStep())
          applyCurrentUrl()
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

  function syncFullUrlOnly () {
    if (!app.model) return
    var url = rebuildUrl(app.model)
    if (app.fullUrlEl) app.fullUrlEl.value = url
    if (app.titleEl) app.titleEl.textContent = deriveLabel(url)
    renderDescriptionForCurrentUrl()
  }

  function renderHistory () {
    if (!app.historyEl) return

    app.historyEl.innerHTML = ''

    app.historyEl.appendChild(createEl('div', {
      style: {
        display: 'flex',
        gap: '6px',
        flexWrap: 'wrap',
        marginBottom: '6px'
      }
    }, [
      button('Clear History', function () {
        app.settings.history = []
        saveState()
        renderHistory()
      }),
      button('Favorite Current', function () {
        var current = ''
        if (app.fullUrlEl) current = app.fullUrlEl.value
        else if (app.model) current = rebuildUrl(app.model)
        if (!current) {
          setStatus('no current URL to favorite')
          return
        }
        addFavorite(current)
        setStatus('favorite added')
      }),
      button('Save Favorites File', function () {
        saveFavoritesFile()
      })
    ]))

    if (!app.settings.history.length) {
      app.historyEl.appendChild(createEl('div', { text: 'No history yet.' }))
      return
    }

    app.settings.history.slice(0, 30).forEach(function (item) {
      var row = createEl('div', {
        style: {
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: '5px',
          alignItems: 'center',
          borderTop: '1px solid rgba(255,255,255,0.12)',
          padding: '5px 0'
        }
      })

      row.appendChild(createEl('button', {
        type: 'button',
        text: item.label || item.title || item.url,
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
        app.settings.history = app.settings.history.filter(function (entry) {
          return entry.url !== item.url
        })
        saveState()
        renderHistory()
      }))

      app.historyEl.appendChild(row)
    })
  }

  function renderAll () {
    if (!app.panel) renderPanel()
    if (app.fullUrlEl && app.model) app.fullUrlEl.value = rebuildUrl(app.model)
    if (app.domainEl && app.model) app.domainEl.value = app.model.host
    renderFields()
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

  function onKeyDown (event) {
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
