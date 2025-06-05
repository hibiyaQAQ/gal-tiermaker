import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { load } from "https://deno.land/std@0.190.0/dotenv/mod.ts";
import { serveDir } from "https://deno.land/std@0.190.0/http/file_server.ts";

// Load environment variables from .env file for local development
const env = await load();

const BGM_CLIENT_ID = Deno.env.get("BGM_CLIENT_ID") || env["BGM_CLIENT_ID"];
const BGM_CLIENT_SECRET = Deno.env.get("BGM_CLIENT_SECRET") || env["BGM_CLIENT_SECRET"];
// This should be the EXACT URI registered in your Bangumi App settings
// For Deno Deploy, it will be your production URL.
// For local dev, it might be http://localhost:8000/api/auth/bangumi/callback
const BGM_REDIRECT_URI = Deno.env.get("BGM_REDIRECT_URI") || env["BGM_REDIRECT_URI"]; 
const FRONTEND_URI = Deno.env.get("FRONTEND_URI") || env["FRONTEND_URI"] || "/"; // Changed to serve from same domain

if (!BGM_CLIENT_ID || !BGM_CLIENT_SECRET || !BGM_REDIRECT_URI) {
    console.error("Error: Missing Bangumi OAuth environment variables (BGM_CLIENT_ID, BGM_CLIENT_SECRET, BGM_REDIRECT_URI).");
    console.log("BGM_CLIENT_ID:", BGM_CLIENT_ID ? 'OK' : 'Missing');
    console.log("BGM_CLIENT_SECRET:", BGM_CLIENT_SECRET ? 'OK' : 'Missing');
    console.log("BGM_REDIRECT_URI:", BGM_REDIRECT_URI ? 'OK' : 'Missing');
    // Deno.exit(1); // Exit if essential variables are missing, but allow running for now to see logs
}

console.log(`Auth server configured with:\n  Client ID: ${BGM_CLIENT_ID}\n  Redirect URI: ${BGM_REDIRECT_URI}\n  Frontend URI: ${FRONTEND_URI}`);

async function handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    console.log(`[Server] Received request: ${request.method} ${url.pathname}`);

    // Handle image proxy API - Base64方式（仿照Spring Boot方案）
    if (request.method === "GET" && url.pathname.startsWith("/api/img/")) {
        // 从路径中提取Base64编码的图片URL
        const base64Url = url.pathname.replace("/api/img/", "");
        
        if (!base64Url) {
            return new Response("Missing base64 encoded image URL", { status: 400 });
        }

        try {
            // 解码Base64获取原始图片URL
            const imageUrl = atob(base64Url);
            console.log(`[Image Proxy] Decoding and proxying: ${imageUrl}`);
            
            const imageResponse = await fetch(imageUrl, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
                    "Referer": "https://bgm.tv/", // 伪装referer
                    "Accept": "image/webp,image/apng,image/*,*/*;q=0.8"
                }
            });

            if (!imageResponse.ok) {
                console.error(`[Image Proxy] Failed to fetch image: ${imageResponse.status} ${imageResponse.statusText}`);
                return new Response(`Failed to fetch image: ${imageResponse.status}`, { status: imageResponse.status });
            }

            const imageBuffer = await imageResponse.arrayBuffer();
            const contentType = imageResponse.headers.get("Content-Type") || "image/jpeg";
            
            console.log(`[Image Proxy] Successfully proxied image, size: ${imageBuffer.byteLength} bytes`);
            
            return new Response(imageBuffer, {
                headers: {
                    "Content-Type": contentType,
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, OPTIONS",
                    "Access-Control-Allow-Headers": "*",
                    "Cache-Control": "public, max-age=86400", // 缓存24小时
                },
            });

        } catch (error) {
            console.error("[Image Proxy] Error:", error);
            if (error.name === 'InvalidCharacterError') {
                return new Response("Invalid base64 encoding", { status: 400 });
            }
            return new Response("Image proxy error: " + error.message, { status: 500 });
        }
    }

    // Handle CORS preflight for image proxy
    if (request.method === "OPTIONS" && url.pathname.startsWith("/api/img/")) {
        return new Response(null, {
            status: 200,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Access-Control-Allow-Headers": "*",
            },
        });
    }

    // Handle OAuth callback API
    if (request.method === "GET" && url.pathname === "/api/auth/bangumi/callback") {
        const code = url.searchParams.get("code");

        if (!code) {
            console.error("[Auth Server] No authorization code received from Bangumi.");
            return new Response("Authorization code missing.", { status: 400 });
        }

        console.log(`[Auth Server] Received authorization code: ${code}`);
        
        // Use the same redirect_uri calculation as frontend
        const dynamicRedirectUri = url.origin + '/api/auth/bangumi/callback';
        console.log(`[Auth Server] BGM_REDIRECT_URI from env: ${BGM_REDIRECT_URI}`);
        console.log(`[Auth Server] Dynamic redirect_uri: ${dynamicRedirectUri}`);
        console.log(`[Auth Server] Request URL origin: ${url.origin}`);
        console.log(`[Auth Server] Full request URL: ${request.url}`);

        try {
            const tokenRequestBody = new URLSearchParams({
                grant_type: "authorization_code",
                client_id: BGM_CLIENT_ID!,
                client_secret: BGM_CLIENT_SECRET!,
                code: code,
                redirect_uri: dynamicRedirectUri, // Use dynamic calculation instead of env variable
            });
            
            console.log(`[Auth Server] Token request body:`, tokenRequestBody.toString());

            const tokenResponse = await fetch("https://bgm.tv/oauth/access_token", {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "User-Agent": "TierMakerApp/1.0 (DenoAuthServer)"
                },
                body: tokenRequestBody,
            });

            if (!tokenResponse.ok) {
                const errorBody = await tokenResponse.text();
                console.error(`[Auth Server] Error from Bangumi token endpoint: ${tokenResponse.status} ${tokenResponse.statusText}`, errorBody);
                return new Response(`Bangumi token exchange failed: ${errorBody}`, { status: tokenResponse.status });
            }

            const tokenData = await tokenResponse.json();
            console.log("[Auth Server] Token data received:", tokenData);

            if (tokenData.error) {
                console.error("[Auth Server] Error in token data from Bangumi:", tokenData.error);
                return new Response(`Bangumi returned an error: ${tokenData.error_description || tokenData.error}`, { status: 400 });
            }

            const accessToken = tokenData.access_token;
            const userId = tokenData.user_id;
            const expiresIn = tokenData.expires_in; // seconds

            // Redirect back to the frontend homepage with token info in hash
            const redirectUrl = new URL(FRONTEND_URI === "/" ? url.origin : FRONTEND_URI);
            redirectUrl.hash = `access_token=${accessToken}&user_id=${userId}&expires_in=${expiresIn}`;
            
            console.log(`[Auth Server] Redirecting to frontend: ${redirectUrl.toString()}`);
            return Response.redirect(redirectUrl.toString(), 302);

        } catch (error) {
            console.error("[Auth Server] Internal server error during token exchange:", error);
            return new Response("Internal server error during token exchange.", { status: 500 });
        }
    }

    // Serve static files for all other requests
    try {
        const response = await serveDir(request, {
            fsRoot: ".",
            urlRoot: "",
            showDirListing: false,
            enableCors: true,
        });

        // If the requested file doesn't exist and it's not an API call, serve index.html (SPA fallback)
        if (response.status === 404 && !url.pathname.startsWith('/api/')) {
            try {
                const indexFile = await Deno.readTextFile("./index.html");
                return new Response(indexFile, {
                    headers: { "content-type": "text/html; charset=utf-8" },
                });
            } catch {
                return new Response("Frontend files not found", { status: 404 });
            }
        }

        return response;
    } catch (error) {
        console.error("[Server] Error serving static files:", error);
        return new Response("Internal server error", { status: 500 });
    }
}

const port = parseInt(Deno.env.get("PORT") || env["PORT"] || "8000");
console.log(`[Server] HTTP server listening on http://localhost:${port}`);
console.log(`[Server] Serving static files from current directory`);
console.log(`[Server] OAuth callback available at /api/auth/bangumi/callback`);
serve(handleRequest, { port }); 
