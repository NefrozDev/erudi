using System.ComponentModel.DataAnnotations;

namespace Erudi.Api.Security;

public sealed class FrontendOptions
{
    public const string Section = "Frontend";

    /// <summary>
    /// Public URL of the Angular app: the only origin allowed to send state-changing requests,
    /// and the base of the links sent by e-mail.
    /// </summary>
    [Required, Url]
    public string Url { get; set; } = "http://localhost:4200";

    /// <summary>The URL as browsers serialize it in the Origin header: scheme, host, non-default port.</summary>
    public string Origin => new Uri(Url).GetLeftPart(UriPartial.Authority);
}
