using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;

namespace Erudi.Api.Auth;

public static class AuthSetup
{
    /// <summary>Limits sign-in attempts per client IP.</summary>
    public const string RateLimitPolicy = "auth";

    /// <summary>Where the identity service sends the browser back with a code.</summary>
    public const string CallbackPath = "/api/auth/callback";

    /// <summary>
    /// Required by the OpenID Connect handler, but never written: the sign-in ends in
    /// <see cref="IdentitySignInEvents.TicketReceived"/>, which opens Erudi's own session.
    /// </summary>
    private const string UnusedSignInScheme = "unused";

    public static IServiceCollection AddErudiAuth(this IServiceCollection services)
    {
        services.AddOptions<AuthOptions>()
            .BindConfiguration(AuthOptions.Section)
            .ValidateDataAnnotations()
            .ValidateOnStart();
        services.AddOptions<IdentityProviderOptions>()
            .BindConfiguration(IdentityProviderOptions.Section)
            .ValidateDataAnnotations()
            .ValidateOnStart();

        services.AddSingleton<SessionCookie>();
        services.AddSingleton<IdentityTokens>();
        services.AddScoped<AuthService>();

        services.AddAuthentication(SessionAuthenticationHandler.SchemeName)
            .AddScheme<AuthenticationSchemeOptions, SessionAuthenticationHandler>(SessionAuthenticationHandler.SchemeName, null)
            .AddCookie(UnusedSignInScheme)
            .AddOpenIdConnect();

        // Read from configuration lazily, so test hosts can replace the identity service.
        services.AddOptions<OpenIdConnectOptions>(OpenIdConnectDefaults.AuthenticationScheme)
            .Configure<IOptions<IdentityProviderOptions>>((options, identity) =>
            {
                options.SignInScheme = UnusedSignInScheme;
                options.Authority = identity.Value.Issuer;
                options.RequireHttpsMetadata = identity.Value.Issuer.StartsWith("https://", StringComparison.Ordinal);
                options.ClientId = identity.Value.ClientId;
                options.ClientSecret = identity.Value.ClientSecret;
                options.ResponseType = OpenIdConnectResponseType.Code;
                // The code comes back in the query of a GET. The default, a form POST from the
                // identity service's origin, would be refused by AllowedOriginMiddleware.
                options.ResponseMode = OpenIdConnectResponseMode.Query;
                options.UsePkce = true;
                options.CallbackPath = CallbackPath;
                options.Scope.Clear();
                foreach (var scope in new[] { "openid", "profile", "email" })
                {
                    options.Scope.Add(scope);
                }

                // The ID token carries everything Erudi keeps; claims keep their JWT names.
                options.GetClaimsFromUserInfoEndpoint = false;
                options.MapInboundClaims = false;
                options.SaveTokens = false;
                // The sign-in cookies (state, nonce) only need to reach the callback, which is a
                // top-level GET from the identity service: Lax is enough (the default, None,
                // needs Secure, which plain-http development cannot have). Secure behind https.
                foreach (var cookie in new[] { options.CorrelationCookie, options.NonceCookie })
                {
                    cookie.Path = CallbackPath;
                    cookie.SameSite = SameSiteMode.Lax;
                    cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
                }
                options.Events = new OpenIdConnectEvents
                {
                    OnRedirectToIdentityProvider = IdentitySignInEvents.RedirectToIdentityProvider,
                    OnTicketReceived = IdentitySignInEvents.TicketReceived,
                    OnRemoteFailure = IdentitySignInEvents.RemoteFailure,
                };
            });
        services.AddAuthorization();

        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.AddPolicy(RateLimitPolicy, context =>
            {
                var limit = context.RequestServices.GetRequiredService<IOptions<AuthOptions>>().Value.RateLimitPerMinute;
                // One bucket per client IP (the real one, thanks to the forwarded headers).
                return RateLimitPartition.GetFixedWindowLimiter(
                    context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                    _ => new FixedWindowRateLimiterOptions { PermitLimit = limit, Window = TimeSpan.FromMinutes(1) });
            });
        });

        return services;
    }
}

/// <summary>The steps of a sign-in through the identity service that are Erudi's own.</summary>
public static class IdentitySignInEvents
{
    /// <summary>The language the app asked for, carried to the sign-in pages.</summary>
    public const string LanguageItem = "lang";

    public static Task RedirectToIdentityProvider(RedirectContext context)
    {
        if (context.Properties.Items.TryGetValue(LanguageItem, out var language) && language is not null)
        {
            context.ProtocolMessage.UiLocales = language;
        }

        return Task.CompletedTask;
    }

    /// <summary>
    /// The ID token checked out (signature, issuer, audience, nonce, PKCE): opens Erudi's
    /// session and returns to where the learner was, instead of the handler's own sign-in.
    /// </summary>
    public static async Task TicketReceived(TicketReceivedContext context)
    {
        var principal = context.Principal!;
        var claims = new IdentityClaims(
            Guid.Parse(principal.FindFirst("sub")!.Value),
            principal.FindFirst("preferred_username")?.Value ?? "",
            principal.FindFirst("email")?.Value ?? "",
            principal.FindFirst("locale")?.Value,
            principal.FindFirst("sid")?.Value);

        var services = context.HttpContext.RequestServices;
        var session = await services.GetRequiredService<AuthService>()
            .SignInAsync(claims, context.HttpContext.RequestAborted);
        services.GetRequiredService<SessionCookie>().Append(context.Response, session);
        context.Response.Redirect(ReturnPath.Safe(context.ReturnUri));
        context.HandleResponse();
    }

    /// <summary>Cancelled, or not this browser's sign-in: the sign-in page says so.</summary>
    public static Task RemoteFailure(RemoteFailureContext context)
    {
        var cancelled = context.Failure?.Message.Contains("access_denied", StringComparison.Ordinal) == true;
        context.Response.Redirect($"/sign-in?signIn={(cancelled ? "cancelled" : "failed")}");
        context.HandleResponse();
        return Task.CompletedTask;
    }
}

/// <summary>Only a path of this site to come back to, never another site (open redirect).</summary>
public static class ReturnPath
{
    public static string Safe(string? path) =>
        path is { Length: > 0 }
        && path[0] == '/'
        && !path.StartsWith("//", StringComparison.Ordinal)
        && !path.StartsWith("/\\", StringComparison.Ordinal)
        && !path.StartsWith("/api/", StringComparison.Ordinal)
            ? path
            : "/";
}
