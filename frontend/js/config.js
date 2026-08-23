// API CONFIG

const hostname = window.location.hostname;

if (hostname === "localhost" || hostname === "127.0.0.1") {
    window.API_BASE_URL = "http://localhost:5000";
} else {
    window.API_BASE_URL = "https://api.muhammadfahadjaved.vercel.app";
}