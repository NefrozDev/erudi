using Erudi.Api.Auth;
using Erudi.Api.Auth.Contracts;
using Erudi.Api.Security;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;

namespace Erudi.Api.Controllers;

/// <summary>
/// Signing in goes through the Synapse identity service (OpenID Connect): the same account
/// opens every Synapse app. Erudi then keeps its own session.
/// </summary>
[ApiController]
[Route("api/auth")]
public sealed class AuthController(
    AuthService auth,
    SessionCookie sessionCookie,
    IdentityTokens identityTokens,
    IOptionsMonitor<OpenIdConnectOptions> oidc,
    IOptions<IdentityProviderOptions> identity,
    IOptions<FrontendOptions> frontend,
    ILogger<AuthController> logger) : ControllerBase
{
    /// <summary>Sends the browser to the identity service, then back to <paramref name="returnTo"/>.</summary>
    [HttpGet("login")]
    [EnableRateLimiting(AuthSetup.RateLimitPolicy)]
    [ProducesResponseType(StatusCodes.Status302Found)]
    public IActionResult Login([FromQuery] string? returnTo, [FromQuery] string? lang)
    {
        var properties = new AuthenticationProperties { RedirectUri = ReturnPath.Safe(returnTo) };
        if (lang is { Length: 2 } && lang.All(char.IsAsciiLetterLower))
        {
            properties.Items[IdentitySignInEvents.LanguageItem] = lang;
        }

        return Challenge(properties, OpenIdConnectDefaults.AuthenticationScheme);
    }

    [Authorize]
    [HttpGet("session")]
    [ProducesResponseType<AuthUserResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public ActionResult<AuthUserResponse> GetSession() => Ok(AuthUserResponse.From(User));

    /// <summary>
    /// Ends Erudi's session and answers where to send the browser next: the identity service,
    /// which signs out of every Synapse app.
    /// </summary>
    [HttpPost("logout")]
    [ProducesResponseType<SignOutResponse>(StatusCodes.Status200OK)]
    public async Task<ActionResult<SignOutResponse>> Logout(CancellationToken cancellationToken)
    {
        await auth.LogoutAsync(SessionCookie.Read(Request), cancellationToken);
        sessionCookie.Delete(Response);
        return Ok(new SignOutResponse(await SignOutUrlAsync(cancellationToken)));
    }

    /// <summary>
    /// Called by the identity service, not by browsers, when a session ends anywhere
    /// (OpenID Connect Back-Channel Logout).
    /// </summary>
    [HttpPost("backchannel-logout")]
    [Consumes("application/x-www-form-urlencoded")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> BackchannelLogout(
        [FromForm(Name = "logout_token")] string? logoutToken,
        CancellationToken cancellationToken)
    {
        var ended = string.IsNullOrEmpty(logoutToken)
            ? null
            : await identityTokens.ValidateLogoutTokenAsync(logoutToken, cancellationToken);
        if (ended is null)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "Invalid logout token");
        }

        await auth.EndSessionsAsync(ended, cancellationToken);
        return Ok();
    }

    /// <summary>
    /// Called by the identity service when an account is deleted: Erudi erases everything it
    /// keeps about it. The body is a signed notice (application/secevent+jwt).
    /// </summary>
    [HttpPost("account-deleted")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> AccountDeleted(CancellationToken cancellationToken)
    {
        using var reader = new StreamReader(Request.Body);
        var notice = await reader.ReadToEndAsync(cancellationToken);
        var userId = notice.Length is > 0 and < 16_384
            ? await identityTokens.ValidateAccountDeletionAsync(notice.Trim(), cancellationToken)
            : null;
        if (userId is null)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "Invalid deletion notice");
        }

        await auth.DeleteAccountAsync(userId.Value, cancellationToken);
        logger.LogInformation("Account {UserId} deleted at the identity service.", userId);
        return NoContent();
    }

    private async Task<string> SignOutUrlAsync(CancellationToken cancellationToken)
    {
        try
        {
            var options = oidc.Get(OpenIdConnectDefaults.AuthenticationScheme);
            var configuration = await options.ConfigurationManager!.GetConfigurationAsync(cancellationToken);
            var query = QueryString.Create(new Dictionary<string, string?>
            {
                ["client_id"] = identity.Value.ClientId,
                ["post_logout_redirect_uri"] = $"{frontend.Value.Origin}/welcome",
            });
            return configuration.EndSessionEndpoint + query;
        }
        catch (InvalidOperationException)
        {
            // The identity service is unreachable: Erudi's session is gone all the same.
            return "/welcome";
        }
    }
}
