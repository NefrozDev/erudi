using Erudi.Api.Auth;
using Erudi.Api.Decks;
using Erudi.Api.Decks.Contracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Erudi.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/decks")]
public sealed class DecksController(DeckService decks) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<DeckResponse>>(StatusCodes.Status200OK)]
    public async Task<IReadOnlyList<DeckResponse>> List(CancellationToken cancellationToken) =>
        await decks.ListAsync(User.GetUserId(), cancellationToken);

    [HttpPost]
    [ProducesResponseType<DeckResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<DeckResponse>> Create(DeckRequest request, CancellationToken cancellationToken) =>
        await decks.CreateAsync(User.GetUserId(), request.Name, cancellationToken) switch
        {
            DeckCreation.Created created => CreatedAtAction(nameof(Get), new { deckId = created.Deck.Id }, created.Deck),
            _ => Problem(
                statusCode: StatusCodes.Status409Conflict,
                title: "Deck limit reached",
                detail: $"An account holds at most {DeckRules.MaxDecksPerUser} decks."),
        };

    [HttpGet("{deckId:guid}")]
    [ProducesResponseType<DeckResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<DeckResponse>> Get(Guid deckId, CancellationToken cancellationToken) =>
        await decks.FindAsync(User.GetUserId(), deckId, cancellationToken) is { } deck ? deck : NotFound();

    [HttpPut("{deckId:guid}")]
    [ProducesResponseType<DeckResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<DeckResponse>> Rename(Guid deckId, DeckRequest request, CancellationToken cancellationToken) =>
        await decks.RenameAsync(User.GetUserId(), deckId, request.Name, cancellationToken) is { } deck ? deck : NotFound();

    [HttpDelete("{deckId:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Delete(Guid deckId, CancellationToken cancellationToken) =>
        await decks.DeleteAsync(User.GetUserId(), deckId, cancellationToken) ? NoContent() : NotFound();

    [HttpGet("{deckId:guid}/cards")]
    [ProducesResponseType<IReadOnlyList<CardSummaryResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<IReadOnlyList<CardSummaryResponse>>> ListCards(Guid deckId, CancellationToken cancellationToken) =>
        await decks.ListCardsAsync(User.GetUserId(), deckId, cancellationToken) is { } cards ? Ok(cards) : NotFound();

    [HttpPost("{deckId:guid}/cards")]
    [ProducesResponseType<CardResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<CardResponse>> AddCard(Guid deckId, CardRequest request, CancellationToken cancellationToken) =>
        await decks.AddCardAsync(User.GetUserId(), deckId, request, cancellationToken) switch
        {
            CardCreation.Created created => CreatedAtAction(
                nameof(CardsController.Get),
                "Cards",
                new { cardId = created.Card.Id },
                created.Card),
            CardCreation.DeckNotFound => NotFound(),
            _ => Problem(
                statusCode: StatusCodes.Status409Conflict,
                title: "Card limit reached",
                detail: $"A deck holds at most {DeckRules.MaxCardsPerDeck} cards."),
        };
}
