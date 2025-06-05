import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { load } from "https://deno.land/std@0.190.0/dotenv/mod.ts";

// Load environment variables from .env file for local development
const env = await load();

const BGM_CLIENT_ID = Deno.env.get("BGM_CLIENT_ID") || env["BGM_CLIENT_ID"];
const BGM_CLIENT_SECRET = Deno.env.get("BGM_CLIENT_SECRET") || env["BGM_CLIENT_SECRET"];
// This should be the EXACT URI registered in your Bangumi App settings
// For Deno Deploy, it will be your production URL.
// For local dev, it might be http://localhost:8000/api/auth/bangumi/callback
const BGM_REDIRECT_URI = Deno.env.get("BGM_REDIRECT_URI") || env["BGM_REDIRECT_URI"]; 
const FRONTEND_URI = Deno.env.get("FRONTEND_URI") || env["FRONTEND_URI"] || "http://localhost:5500"; // Or your file:/// path for local dev if not serving index.html

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
    console.log(`[Auth Server] Received request: ${request.method} ${url.pathname}`);

    if (request.method === "GET" && url.pathname === "/api/auth/bangumi/callback") {
        const code = url.searchParams.get("code");

        if (!code) {
            console.error("[Auth Server] No authorization code received from Bangumi.");
            return new Response("Authorization code missing.", { status: 400 });
        }

        console.log(`[Auth Server] Received authorization code: ${code}`);

        try {
            const tokenResponse = await fetch("https://bgm.tv/oauth/access_token", {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "User-Agent": "TierMakerApp/1.0 (DenoAuthServer)"
                },
                body: new URLSearchParams({
                    grant_type: "authorization_code",
                    client_id: BGM_CLIENT_ID!,
                    client_secret: BGM_CLIENT_SECRET!,
                    code: code,
                    redirect_uri: BGM_REDIRECT_URI!,
                }),
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

            // Redirect back to the frontend, passing token info in the hash
            // The frontend will pick it up from window.location.hash
            const redirectUrl = new URL(FRONTEND_URI || "index.html"); // Default to index.html if no specific path
            redirectUrl.hash = `access_token=${accessToken}&user_id=${userId}&expires_in=${expiresIn}`;
            
            console.log(`[Auth Server] Redirecting to frontend: ${redirectUrl.toString()}`);
            return Response.redirect(redirectUrl.toString(), 302);

        } catch (error) {
            console.error("[Auth Server] Internal server error during token exchange:", error);
            return new Response("Internal server error during token exchange.", { status: 500 });
        }
    } else if (request.method === "GET" && url.pathname === "/") {
        return new Response("Auth server is running. Use /api/auth/bangumi/callback for Bangumi OAuth.", { status: 200 });
    } 

    return new Response("Not Found", { status: 404 });
}

const port = parseInt(Deno.env.get("PORT") || env["PORT"] || "8000");
console.log(`[Auth Server] HTTP server listening on http://localhost:${port}`);
serve(handleRequest, { port }); 