using Microsoft.Extensions.Options;

namespace Erudi.Api.Security;

/// <summary>
/// CSRF protection for the session cookie: a state-changing request coming from another site
/// is refused. Browsers always send an Origin header with such requests; clients that send
/// neither Origin nor Referer are not browsers, so they cannot carry a victim's cookie.
/// </summary>
public sealed class AllowedOriginMiddleware(RequestDelegate next, IOptions<FrontendOptions> frontend)
{
    public async Task InvokeAsync(HttpContext context)
    {
        if (IsSafe(context.Request.Method) || IsAllowed(context.Request))
        {
            await next(context);
            return;
        }

        // An empty 403: UseStatusCodePages turns it into problem details.
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
    }

    private static bool IsSafe(string method) =>
        HttpMethods.IsGet(method) || HttpMethods.IsHead(method) || HttpMethods.IsOptions(method);

    private bool IsAllowed(HttpRequest request)
    {
        var allowed = frontend.Value.Origin;
        string? origin = request.Headers.Origin;

        if (!string.IsNullOrEmpty(origin))
        {
            // Browsers send "null" from sandboxed or privacy-sensitive contexts: never allowed.
            return string.Equals(origin, allowed, StringComparison.OrdinalIgnoreCase);
        }

        string? referer = request.Headers.Referer;
        if (string.IsNullOrEmpty(referer))
        {
            return true;
        }

        return Uri.TryCreate(referer, UriKind.Absolute, out var refererUri)
            && string.Equals(refererUri.GetLeftPart(UriPartial.Authority), allowed, StringComparison.OrdinalIgnoreCase);
    }
}
