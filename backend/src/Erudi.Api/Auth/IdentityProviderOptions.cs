using System.ComponentModel.DataAnnotations;

namespace Erudi.Api.Auth;

/// <summary>
/// Erudi as a client of the Synapse identity service (OpenID Connect), which owns the
/// accounts. Production passes them as Identity__Issuer, Identity__ClientId and
/// Identity__ClientSecret.
/// </summary>
public sealed class IdentityProviderOptions
{
    public const string Section = "Identity";

    /// <summary>e.g. https://auth.synapseengineering.dev/oidc</summary>
    [Required, Url]
    public string Issuer { get; set; } = "";

    [Required]
    public string ClientId { get; set; } = "erudi";

    [Required]
    public string ClientSecret { get; set; } = "";
}

/// <summary>What Erudi keeps of a person from the identity service's ID token.</summary>
public sealed record IdentityClaims(Guid Subject, string Username, string Email, string? Locale, string? SessionId);
