using Erudi.Api.Auth;
using Erudi.Api.Auth.Contracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Erudi.Api.Controllers;

/// <summary>
/// The signed-in learner's own account. Outside <c>api/auth</c> on purpose: the app treats a
/// 401 here as an ended session, while auth routes answer 401 for wrong credentials.
/// </summary>
[ApiController]
[Authorize]
[Route("api/account")]
public sealed class AccountController(AuthService auth, SessionCookie sessionCookie) : ControllerBase
{
    /// <summary>Deletes the account for good, once the password confirms it.</summary>
    [HttpDelete]
    // The password check makes this a way to guess passwords from a session left open.
    [EnableRateLimiting(AuthSetup.RateLimitPolicy)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Delete([FromBody] AccountDeletionRequest request, CancellationToken cancellationToken)
    {
        if (!await auth.DeleteAccountAsync(User.GetUserId(), request.Password, cancellationToken))
        {
            ModelState.AddModelError("password", "The password is incorrect.");
            return ValidationProblem();
        }

        sessionCookie.Delete(Response);
        return NoContent();
    }
}
