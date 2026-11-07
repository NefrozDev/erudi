using Erudi.Api.Auth;
using Erudi.Api.Study;
using Erudi.Api.Study.Contracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Erudi.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/study")]
public sealed class StudyController(StudyService study) : ControllerBase
{
    [HttpGet("summary")]
    [ProducesResponseType<StudySummaryResponse>(StatusCodes.Status200OK)]
    public async Task<StudySummaryResponse> Summary(CancellationToken cancellationToken) =>
        await study.SummarizeAsync(User.GetUserId(), cancellationToken);

    /// <summary>The due cards of every deck, or of <paramref name="deckId"/> only.</summary>
    [HttpGet("quiz")]
    [ProducesResponseType<IReadOnlyList<StudyCardResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<IReadOnlyList<StudyCardResponse>>> Quiz([FromQuery] Guid? deckId, CancellationToken cancellationToken) =>
        await study.QuizAsync(User.GetUserId(), deckId, cancellationToken) is { } cards ? Ok(cards) : NotFound();

    /// <summary>Random cards of every deck, or of <paramref name="deckId"/> only. Answers stay in the app.</summary>
    [HttpGet("practice")]
    [ProducesResponseType<IReadOnlyList<StudyCardResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<IReadOnlyList<StudyCardResponse>>> Practice([FromQuery] Guid? deckId, CancellationToken cancellationToken) =>
        await study.PracticeAsync(User.GetUserId(), deckId, cancellationToken) is { } cards ? Ok(cards) : NotFound();

    /// <summary>A quiz answer: moves the card to its next box.</summary>
    [HttpPost("answers")]
    [ProducesResponseType<AnswerResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<AnswerResponse>> Answer(AnswerRequest request, CancellationToken cancellationToken) =>
        await study.AnswerAsync(User.GetUserId(), request.CardId!.Value, request.Knew!.Value, cancellationToken) switch
        {
            AnswerResult.Recorded recorded => recorded.Answer,
            AnswerResult.CardNotFound => NotFound(),
            _ => Problem(
                statusCode: StatusCodes.Status409Conflict,
                title: "Card not due",
                detail: "This card was already answered today, or is not due yet."),
        };
}
