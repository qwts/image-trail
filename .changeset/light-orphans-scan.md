---
'image-trail': patch
---

Keep storage-health and unused-original cleanup scans lightweight by reading only blob IDs and creation-time indexes instead of materializing encrypted image bytes.
