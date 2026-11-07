using System.ComponentModel.DataAnnotations;
using Erudi.Api.Auth;
using Erudi.Api.Decks;
using Erudi.Api.Decks.Contracts;
using Erudi.Api.Explore;
using Erudi.Api.Explore.Contracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Erudi.Api.Controllers;

/// <summary>The public library. A deck that is not published answers 404.</summary>
[ApiController]
[Authorize]
[Route("api/explore")]
public sealed class ExploreController(ExploreService explore) : ControllerBase
{
    /// <summary>The 50 most used public decks, matching <paramref name="search"/> and <paramref name="category"/> when given.</summary>
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<PublicDeckSummaryResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<IReadOnlyList<PublicDeckSummaryResponse>> Search(
        [FromQuery(Name = "q"), StringLength(ExploreRules.SearchMaxLength)] string? search,
        [FromQuery] DeckCategory? category,
        CancellationToken cancellationToken) =>
        await explore.SearchAsync(search, category, cancellationToken);

    [HttpGet("{deckId:guid}")]
    [ProducesResponseType<PublicDeckResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<PublicDeckResponse>> Get(Guid deckId, CancellationToken cancellationToken) =>
        await explore.FindAsync(User.GetUserId(), deckId, cancellationToken) is { } deck ? deck : NotFound();

    /// <summary>20 random cards to test oneself on. Answers stay in the app until the result.</summary>
    [HttpGet("{deckId:guid}/test")]
    [ProducesResponseType<IReadOnlyList<TestCardResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<IReadOnlyList<TestCardResponse>>> TestCards(Guid deckId, CancellationToken cancellationToken) =>
        await explore.TestCardsAsync(deckId, cancellationToken) is { } cards ? Ok(cards) : NotFound();

    [HttpPost("{deckId:guid}/results")]
    [ProducesResponseType<TestResultResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<TestResultResponse>> RecordResult(Guid deckId, TestResultRequest request, CancellationToken cancellationToken) =>
        await explore.RecordResultAsync(User.GetUserId(), deckId, request.Known!.Value, request.Total!.Value, cancellationToken) is { } result
            ? result
            : NotFound();

    /// <summary>Copies the deck into the learner's account ("Ajouter à mes paquets").</summary>
    [HttpPost("{deckId:guid}/copies")]
    [ProducesResponseType<DeckResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<DeckResponse>> Copy(Guid deckId, CancellationToken cancellationToken) =>
        await explore.CopyAsync(User.GetUserId(), deckId, cancellationToken) switch
        {
            DeckCopy.Created created => CreatedAtAction(
                nameof(DecksController.Get),
                "Decks",
                new { deckId = created.Deck.Id },
                created.Deck),
            DeckCopy.DeckNotFound => NotFound(),
            _ => Problem(
                statusCode: StatusCodes.Status409Conflict,
                title: "Deck limit reached",
                detail: $"An account holds at most {DeckRules.MaxDecksPerUser} decks."),
        };

    [HttpPost("{deckId:guid}/reports")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Report(Guid deckId, ReportRequest request, CancellationToken cancellationToken) =>
        await explore.ReportAsync(User.GetUserId(), deckId, request.Reason!.Value, request.Details, cancellationToken)
            ? NoContent()
            : NotFound();
}
