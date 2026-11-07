using Erudi.Api.Auth;
using Erudi.Api.Explore;
using Erudi.Api.Explore.Contracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Erudi.Api.Controllers;

/// <summary>The learner's own deck in the Explorer: someone else's deck answers 404.</summary>
[ApiController]
[Authorize]
[Route("api/decks/{deckId:guid}/publication")]
public sealed class PublicationsController(PublicationService publications) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<PublicationResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<PublicationResponse>> Get(Guid deckId, CancellationToken cancellationToken) =>
        await publications.FindAsync(User.GetUserId(), deckId, cancellationToken) is { } publication ? publication : NotFound();

    /// <summary>Publishes the deck, or updates its title, category and description.</summary>
    [HttpPut]
    [ProducesResponseType<PublicationResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<PublicationResponse>> Publish(Guid deckId, PublicationRequest request, CancellationToken cancellationToken) =>
        await publications.PublishAsync(User.GetUserId(), deckId, request, cancellationToken) switch
        {
            Publishing.Published published => published.Publication,
            Publishing.DeckNotFound => NotFound(),
            _ => Problem(
                statusCode: StatusCodes.Status409Conflict,
                title: "Deck is empty",
                detail: "Add a card to the deck before publishing it."),
        };

    [HttpDelete]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Unpublish(Guid deckId, CancellationToken cancellationToken) =>
        await publications.UnpublishAsync(User.GetUserId(), deckId, cancellationToken) ? NoContent() : NotFound();
}
