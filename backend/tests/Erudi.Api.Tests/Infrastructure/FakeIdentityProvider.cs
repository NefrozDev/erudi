using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace Erudi.Api.Tests.Infrastructure;

/// <summary>
/// Stands in for the Synapse identity service: its discovery document is given to the
/// OpenID Connect handler, its token endpoint answers the handler's code exchange, and it
/// signs logout tokens and deletion notices with a key made for the test run.
/// </summary>
public sealed class FakeIdentityProvider : HttpMessageHandler
{
    public const string Issuer = "https://auth.test/oidc";
    public const string ClientId = "erudi";
    public const string ClientSecret = "test-secret";

    private readonly RsaSecurityKey key = new(RSA.Create(2048)) { KeyId = "test-key" };

    public FakeIdentityProvider()
    {
        Configuration = new OpenIdConnectConfiguration
        {
            Issuer = Issuer,
            AuthorizationEndpoint = $"{Issuer}/auth",
            TokenEndpoint = $"{Issuer}/token",
            EndSessionEndpoint = $"{Issuer}/session/end",
        };
        Configuration.SigningKeys.Add(key);
    }

    public OpenIdConnectConfiguration Configuration { get; }

    /// <summary>The person the next code exchange signs in, or <c>null</c> to refuse it.</summary>
    public Dictionary<string, object>? NextIdentity { get; set; }

    /// <summary>The nonce the next ID token carries: the one the handler sent to /auth.</summary>
    public string? Nonce { get; set; }

    /// <summary>The form bodies the token endpoint received.</summary>
    public List<string> TokenRequests { get; } = [];

    /// <summary>A JWT as the identity service signs it; <paramref name="audience"/> to forge one for another app.</summary>
    public string Sign(Dictionary<string, object> claims, string? type = null, string audience = ClientId) =>
        new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = Issuer,
            Audience = audience,
            Claims = claims,
            IssuedAt = DateTime.UtcNow,
            NotBefore = DateTime.UtcNow.AddSeconds(-5),
            Expires = DateTime.UtcNow.AddMinutes(5),
            TokenType = type,
            SigningCredentials = new SigningCredentials(key, SecurityAlgorithms.RsaSha256),
        });

    public string LogoutToken(Guid? subject, string? sessionId, string audience = ClientId)
    {
        var claims = new Dictionary<string, object>
        {
            ["jti"] = Guid.NewGuid().ToString(),
            ["events"] = new Dictionary<string, object> { ["http://schemas.openid.net/event/backchannel-logout"] = new Dictionary<string, object>() },
        };
        if (subject is not null) claims["sub"] = subject.Value.ToString();
        if (sessionId is not null) claims["sid"] = sessionId;
        return Sign(claims, audience: audience);
    }

    public string DeletionNotice(Guid subject, string audience = ClientId) => Sign(
        new Dictionary<string, object>
        {
            ["sub"] = subject.ToString(),
            ["jti"] = Guid.NewGuid().ToString(),
            ["events"] = new Dictionary<string, object> { ["https://auth.synapseengineering.dev/events/account-deleted"] = new Dictionary<string, object>() },
        },
        type: "secevent+jwt",
        audience: audience);

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        if (request.RequestUri?.AbsoluteUri != Configuration.TokenEndpoint)
        {
            return new HttpResponseMessage(HttpStatusCode.NotFound);
        }

        TokenRequests.Add(await request.Content!.ReadAsStringAsync(cancellationToken));
        if (NextIdentity is null)
        {
            return new HttpResponseMessage(HttpStatusCode.BadRequest)
            {
                Content = JsonContent.Create(new { error = "invalid_grant" }),
            };
        }

        var claims = new Dictionary<string, object>(NextIdentity);
        if (Nonce is not null) claims["nonce"] = Nonce;
        return new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = JsonContent.Create(new Dictionary<string, object>
            {
                ["access_token"] = "access-token",
                ["token_type"] = "Bearer",
                ["expires_in"] = 3600,
                ["id_token"] = Sign(claims),
            }),
        };
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) key.Rsa.Dispose();
        base.Dispose(disposing);
    }
}
