---
'image-trail': patch
---

Keep storage-health and unused-original cleanup scans lightweight by reading only blob IDs, creation times, and encrypted byte-length indexes instead of materializing encrypted image bytes.
