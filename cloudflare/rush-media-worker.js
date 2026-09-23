// Private R2 gateway. Only the RUSH server holds MEDIA_GATEWAY_SECRET.
// Firebase session and conversation checks happen in Next.js before requests arrive here.
const KEY = /^(?:attachments\/(?:dm|group|space)\/[A-Za-z0-9_-]+|avatars\/[A-Za-z0-9_-]+)\/[a-f0-9-]{36}$/;
const MIME = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "video/mp4", "video/webm", "video/quicktime", "application/pdf",
]);

export default {
  async fetch(request, env) {
    if (request.headers.get("authorization") !== `Bearer ${env.MEDIA_GATEWAY_SECRET}`)
      return new Response(null, { status: 401 });
    const key = request.headers.get("x-r2-key") ?? "";
    if (!KEY.test(key)) return new Response(null, { status: 400 });

    if (request.method === "PUT") {
      const type = request.headers.get("content-type") ?? "";
      if (!MIME.has(type)) return new Response(null, { status: 415 });
      const declared = Number(request.headers.get("content-length"));
      if (declared > 50 * 1024 * 1024) return new Response(null, { status: 413 });
      const body = await request.arrayBuffer();
      if (!body.byteLength || body.byteLength > 50 * 1024 * 1024)
        return new Response(null, { status: 413 });
      await env.MEDIA.put(key, body, { httpMetadata: { contentType: type } });
      return new Response(null, { status: 201 });
    }
    if (request.method === "DELETE") {
      await env.MEDIA.delete(key);
      return new Response(null, { status: 204 });
    }
    if (request.method === "GET") {
      const range = request.headers.get("range");
      let options;
      let start = 0;
      let end;
      if (range) {
        const match = /^bytes=(\d+)-(\d*)$/.exec(range);
        if (!match) return new Response(null, { status: 416 });
        const head = await env.MEDIA.head(key);
        if (!head) return new Response(null, { status: 404 });
        start = Number(match[1]);
        end = match[2] ? Number(match[2]) : head.size - 1;
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= head.size)
          return new Response(null, { status: 416 });
        end = Math.min(end, head.size - 1);
        options = { range: { offset: start, length: end - start + 1 } };
      }
      const object = await env.MEDIA.get(key, options);
      if (!object || !("body" in object)) return new Response(null, { status: 404 });
      const headers = new Headers({
        "content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
        "content-length": String(range ? end - start + 1 : object.size),
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "accept-ranges": "bytes",
      });
      if (range) headers.set("content-range", `bytes ${start}-${end}/${object.size}`);
      return new Response(object.body, { status: range ? 206 : 200, headers });
    }
    return new Response(null, { status: 405, headers: { Allow: "PUT, GET, DELETE" } });
  },
};
