using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Erudi.Api.Auth;

/// <summary>An identity session that ended, as a back-channel logout token names it.</summary>
public sealed record EndedSession(Guid? Subject, string? SessionId);

/// <summary>
/// Checks what the identity service sends Erudi directly, server to server: back-channel
/// logout tokens and account deletion notices. Both are JWTs signed with the keys the
/// service publishes, the same the OpenID Connect handler reads through discovery.
/// </summary>
public sealed class IdentityTokens(
    IOptionsMonitor<OpenIdConnectOptions> oidc,
    IOptions<IdentityProviderOptions> identity)
{
    public const string AccountDeletedEvent = "https://auth.synapseengineering.dev/events/account-deleted";
    private const string BackchannelLogoutEvent = "http://schemas.openid.net/event/backchannel-logout";

    /// <returns>The ended session, or <c>null</c> when the token is not a valid logout token for Erudi.</returns>
    public async Task<EndedSession?> ValidateLogoutTokenAsync(string token, CancellationToken cancellationToken)
    {
        var result = await ValidateAsync(token, type: null, cancellationToken);
        if (!result.IsValid
            || !HasEvent(result, BackchannelLogoutEvent)
            // A nonce means an ID token, which must never pass for a logout token.
            || result.Claims.ContainsKey("nonce"))
        {
            return null;
        }

        var subject = Guid.TryParse(Claim(result, "sub"), out var id) ? id : (Guid?)null;
        var sessionId = Claim(result, "sid");
        return subject is null && sessionId is null ? null : new EndedSession(subject, sessionId);
    }

    /// <returns>The deleted account, or <c>null</c> when the notice is not valid for Erudi.</returns>
    public async Task<Guid?> ValidateAccountDeletionAsync(string token, CancellationToken cancellationToken)
    {
        var result = await ValidateAsync(token, "secevent+jwt", cancellationToken);
        return result.IsValid && HasEvent(result, AccountDeletedEvent) && Guid.TryParse(Claim(result, "sub"), out var id)
            ? id
            : null;
    }

    private async Task<TokenValidationResult> ValidateAsync(string token, string? type, CancellationToken cancellationToken)
    {
        var options = oidc.Get(OpenIdConnectDefaults.AuthenticationScheme);
        var configuration = await options.ConfigurationManager!.GetConfigurationAsync(cancellationToken);
        var parameters = new TokenValidationParameters
        {
            ValidIssuer = identity.Value.Issuer,
            ValidAudience = identity.Value.ClientId,
            IssuerSigningKeys = configuration.SigningKeys,
            ValidTypes = type is null ? null : [type],
            ClockSkew = TimeSpan.FromMinutes(1),
        };
        return await new JsonWebTokenHandler().ValidateTokenAsync(token, parameters);
    }

    private static bool HasEvent(TokenValidationResult result, string name) =>
        result.SecurityToken is JsonWebToken jwt
        && jwt.TryGetPayloadValue<Dictionary<string, object>>("events", out var events)
        && events.ContainsKey(name);

    private static string? Claim(TokenValidationResult result, string name) =>
        result.Claims.TryGetValue(name, out var value) && value is string text && text.Length > 0 ? text : null;
}
