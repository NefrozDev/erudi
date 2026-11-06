using System.Threading.RateLimiting;
using Erudi.Api.Users;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;

namespace Erudi.Api.Auth;

public static class AuthSetup
{
    /// <summary>Slows password guessing and e-mail flooding without hindering a real user.</summary>
    public const string RateLimitPolicy = "auth";

    public static IServiceCollection AddErudiAuth(this IServiceCollection services)
    {
        services.AddOptions<AuthOptions>()
            .BindConfiguration(AuthOptions.Section)
            .ValidateDataAnnotations()
            .ValidateOnStart();

        services.AddSingleton<IPasswordHasher<User>, PasswordHasher<User>>();
        services.AddSingleton<PasswordService>();
        services.AddSingleton<SessionCookie>();
        services.AddScoped<AuthService>();
        services.AddScoped<PasswordResetService>();

        services.AddAuthentication(SessionAuthenticationHandler.SchemeName)
            .AddScheme<AuthenticationSchemeOptions, SessionAuthenticationHandler>(SessionAuthenticationHandler.SchemeName, null);
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
