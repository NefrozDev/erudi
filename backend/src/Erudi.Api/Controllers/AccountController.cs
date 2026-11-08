using Erudi.Api.Auth;
using Erudi.Api.Auth.Contracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Erudi.Api.Controllers;

/// <summary>
/// The signed-in learner's Erudi settings. The account itself (username, e-mail, password,
/// deletion) is managed on the Synapse account page.
/// </summary>
[ApiController]
[Authorize]
[Route("api/account")]
public sealed class AccountController(AuthService auth) : ControllerBase
{
    /// <summary>Erudi's own terms, accepted once on its first screen after signing in.</summary>
    [HttpPost("terms")]
    [ProducesResponseType<AuthUserResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<AuthUserResponse>> AcceptTerms(CancellationToken cancellationToken)
    {
        var user = await auth.AcceptTermsAsync(User.GetUserId(), cancellationToken);
        return user is null ? Unauthorized() : Ok(AuthUserResponse.From(user));
    }
}
