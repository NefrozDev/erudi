using Erudi.Api.Auth;
using Erudi.Api.Auth.Contracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Erudi.Api.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class AuthController(
    AuthService auth,
    PasswordResetService passwordResets,
    SessionCookie sessionCookie) : ControllerBase
{
    [HttpPost("register")]
    [EnableRateLimiting(AuthSetup.RateLimitPolicy)]
    [ProducesResponseType<AuthUserResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<AuthUserResponse>> Register(RegisterRequest request, CancellationToken cancellationToken)
    {
        switch (await auth.RegisterAsync(request, cancellationToken))
        {
            case RegistrationResult.Registered registered:
                sessionCookie.Append(Response, registered.Session);
                return StatusCode(StatusCodes.Status201Created, AuthUserResponse.From(registered.Session.User));

            case RegistrationResult.Taken { Field: AccountField.Email }:
                ModelState.AddModelError("email", "This e-mail address already has an account.");
                break;

            default:
                ModelState.AddModelError("username", "This username is taken.");
                break;
        }

        return ValidationProblem(statusCode: StatusCodes.Status409Conflict, modelStateDictionary: ModelState);
    }

    [HttpPost("login")]
    [EnableRateLimiting(AuthSetup.RateLimitPolicy)]
    [ProducesResponseType<AuthUserResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<AuthUserResponse>> Login(LoginRequest request, CancellationToken cancellationToken)
    {
        var session = await auth.LoginAsync(request, cancellationToken);
        if (session is null)
        {
            return Problem(
                statusCode: StatusCodes.Status401Unauthorized,
                title: "Invalid credentials",
                detail: "The e-mail address or the password is incorrect.");
        }

        sessionCookie.Append(Response, session);
        return Ok(AuthUserResponse.From(session.User));
    }

    [Authorize]
    [HttpGet("session")]
    [ProducesResponseType<AuthUserResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public ActionResult<AuthUserResponse> GetSession() => Ok(AuthUserResponse.From(User));

    [HttpPost("logout")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Logout(CancellationToken cancellationToken)
    {
        await auth.LogoutAsync(SessionCookie.Read(Request), cancellationToken);
        sessionCookie.Delete(Response);
        return NoContent();
    }

    /// <summary>Always 204, so the answer never tells whether the address has an account.</summary>
    [HttpPost("password-reset")]
    [EnableRateLimiting(AuthSetup.RateLimitPolicy)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> RequestPasswordReset(PasswordResetRequest request, CancellationToken cancellationToken)
    {
        await passwordResets.RequestAsync(request.Email, cancellationToken);
        return NoContent();
    }

    [HttpPost("password-reset/confirm")]
    [EnableRateLimiting(AuthSetup.RateLimitPolicy)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> ConfirmPasswordReset(PasswordResetConfirmation request, CancellationToken cancellationToken)
    {
        if (await passwordResets.ConfirmAsync(request.Token, request.Password, cancellationToken))
        {
            return NoContent();
        }

        return Problem(
            statusCode: StatusCodes.Status400BadRequest,
            title: "Invalid reset link",
            detail: "This link is unknown, expired or already used.");
    }
}
