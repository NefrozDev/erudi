using System.Net;
using System.Net.Http.Json;
using Erudi.Api.Study;
using Erudi.Api.Study.Contracts;
using Erudi.Api.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Erudi.Api.Tests.Study;

public sealed class StudyStatsTests(ErudiApiFactory factory) : IClassFixture<ErudiApiFactory>
{
    private static CancellationToken Cancellation => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Stats_ForANewLearner_AreEmpty_WithTheDefaultPace()
    {
        using var learner = await factory.SignInNewLearnerAsync();

        var stats = await StatsAsync(learner.Client);

        Assert.Equal(
            (0, 0, false, 0, 0, (int?)null, 0, 0, StudyService.DefaultSecondsPerCard),
            (stats.CurrentStreak, stats.BestStreak, stats.StudiedToday, stats.StudyDays, stats.TotalReviews, stats.SuccessRate, stats.CardCount, stats.MasteredCount, stats.SecondsPerCard));
        Assert.Equal(StudyService.ActivityDays, stats.LastDays.Count);
        Assert.Equal(factory.Today(), stats.LastDays[^1].Day);
        Assert.All(stats.LastDays, day => Assert.Equal((0, 0), (day.Reviews, day.Known)));
    }

    [Fact]
    public async Task Stats_CountTheStreaksTheActivityAndTheSuccessRate_OfTheLearnerOnly()
    {
        using var learner = await factory.SignInNewLearnerAsync();
        using var stranger = await factory.SignInNewLearnerAsync();
        var today = factory.Today();
        // Today and the two days before: a streak of 3. Days 10 to 13 ago: the best one, 4.
        await AddReviewsAsync(learner.Id, today, known: 3, unknown: 1);
        await AddReviewsAsync(learner.Id, today.AddDays(-1), known: 1, unknown: 0);
        await AddReviewsAsync(learner.Id, today.AddDays(-2), known: 0, unknown: 2);
        for (var daysAgo = 10; daysAgo <= 13; daysAgo++)
        {
            await AddReviewsAsync(learner.Id, today.AddDays(-daysAgo), known: 1, unknown: 0);
        }

        // Older than 30 days: in the total, not in the success rate.
        await AddReviewsAsync(learner.Id, today.AddDays(-40), known: 0, unknown: 5);
        await AddReviewsAsync(stranger.Id, today, known: 9, unknown: 9);
        var deck = await learner.Client.CreateDeckAsync();
        var mastered = await learner.Client.AddCardAsync(deck.Id, "mastered");
        await learner.Client.AddCardAsync(deck.Id, "new");
        await factory.QueryAsync(db => db.Cards.Where(c => c.Id == mastered.Id).ExecuteUpdateAsync(s => s.SetProperty(c => c.Box, 4), Cancellation));

        var stats = await StatsAsync(learner.Client);

        Assert.Equal((3, 4, true, 8), (stats.CurrentStreak, stats.BestStreak, stats.StudiedToday, stats.StudyDays));
        Assert.Equal(16, stats.TotalReviews);
        // 8 known out of 11 answers within 30 days.
        Assert.Equal(73, stats.SuccessRate);
        Assert.Equal((2, 1), (stats.CardCount, stats.MasteredCount));
        Assert.Equal(new DayActivityResponse(today, 4, 3), stats.LastDays[^1]);
        Assert.Equal(new DayActivityResponse(today.AddDays(-2), 2, 0), stats.LastDays[^3]);
        Assert.Equal(new DayActivityResponse(today.AddDays(-13), 1, 1), stats.LastDays[0]);
        Assert.Equal(new DayActivityResponse(today.AddDays(-5), 0, 0), stats.LastDays[^6]);
    }

    [Fact]
    public async Task Pace_IsTheMedianTimeBetweenAnswers_WithoutBreaks()
    {
        using var learner = await factory.SignInNewLearnerAsync();
        var start = factory.Clock.GetUtcNow().AddHours(-3);
        // Twelve answers 6 to 8 seconds apart, then a 10-minute break and one more answer.
        var gaps = new[] { 6, 7, 6, 8, 6, 7, 6, 6, 8, 7, 6 };
        var times = gaps.Aggregate(new List<DateTimeOffset> { start }, (all, gap) => [.. all, all[^1].AddSeconds(gap)]);
        times.Add(times[^1].AddMinutes(10));
        await AddReviewsAtAsync(learner.Id, times);

        var stats = await StatsAsync(learner.Client);
        var summary = await learner.Client.GetFromJsonAsync<StudySummaryResponse>("/api/study/summary", Cancellation);

        Assert.Equal(6, stats.SecondsPerCard);
        Assert.Equal(6, summary!.SecondsPerCard);
    }

    [Fact]
    public async Task Pace_StaysTheDefaultUntilEnoughAnswers()
    {
        using var learner = await factory.SignInNewLearnerAsync();
        var start = factory.Clock.GetUtcNow().AddHours(-1);
        await AddReviewsAtAsync(learner.Id, [.. Enumerable.Range(0, 5).Select(i => start.AddSeconds(30 * i))]);

        var stats = await StatsAsync(learner.Client);

        Assert.Equal(StudyService.DefaultSecondsPerCard, stats.SecondsPerCard);
    }

    [Fact]
    public async Task DeckStats_CountTheDecksBoxesAndTheAnswersAboutItsCards()
    {
        using var learner = await factory.SignInNewLearnerAsync();
        var deck = await learner.Client.CreateDeckAsync("Anglais");
        var other = await learner.Client.CreateDeckAsync("Histoire");
        var first = await learner.Client.AddCardAsync(deck.Id, "a deadline");
        var second = await learner.Client.AddCardAsync(deck.Id, "to run out of");
        await learner.Client.AddCardAsync(deck.Id, "to look forward to");
        var elsewhere = await learner.Client.AddCardAsync(other.Id, "1830");
        await factory.QueryAsync(db => db.Cards.Where(c => c.Id == second.Id).ExecuteUpdateAsync(s => s.SetProperty(c => c.Box, 3), Cancellation));
        var today = factory.Today();
        await AddReviewsAsync(learner.Id, today.AddDays(-3), known: 1, unknown: 0, first.Id);
        await AddReviewsAsync(learner.Id, today.AddDays(-2), known: 0, unknown: 1, second.Id);
        await AddReviewsAsync(learner.Id, today, known: 4, unknown: 0, elsewhere.Id);

        var stats = await learner.Client.GetFromJsonAsync<DeckStatsResponse>($"/api/study/decks/{deck.Id}/stats", Cancellation);

        Assert.Equal([2, 0, 1, 0, 0], stats!.Boxes);
        Assert.Equal((2, 50, today.AddDays(-2)), (stats.TotalReviews, stats.SuccessRate, stats.LastStudiedOn));
        Assert.Equal(StudyService.DefaultSecondsPerCard, stats.SecondsPerCard);
    }

    [Fact]
    public async Task DeckStats_OfANewDeck_HaveNoAnswers()
    {
        using var learner = await factory.SignInNewLearnerAsync();
        var deck = await learner.Client.CreateDeckAsync();

        var stats = await learner.Client.GetFromJsonAsync<DeckStatsResponse>($"/api/study/decks/{deck.Id}/stats", Cancellation);

        Assert.Equal([0, 0, 0, 0, 0], stats!.Boxes);
        Assert.Equal((0, (int?)null, (DateOnly?)null), (stats.TotalReviews, stats.SuccessRate, stats.LastStudiedOn));
    }

    [Fact]
    public async Task DeckStats_OfSomeoneElsesOrAMissingDeck_AreNotFound()
    {
        using var owner = await factory.SignInNewLearnerAsync();
        using var stranger = await factory.SignInNewLearnerAsync();
        var deck = await owner.Client.CreateDeckAsync();

        using var foreign = await stranger.Client.GetAsync($"/api/study/decks/{deck.Id}/stats", Cancellation);
        using var missing = await owner.Client.GetAsync($"/api/study/decks/{Guid.NewGuid()}/stats", Cancellation);

        Assert.Equal((HttpStatusCode.NotFound, HttpStatusCode.NotFound), (foreign.StatusCode, missing.StatusCode));
    }

    [Theory]
    [InlineData("/api/study/stats")]
    [InlineData("/api/study/decks/0198f0d6-0000-7000-8000-000000000000/stats")]
    public async Task Endpoints_RequireASession(string url)
    {
        using var client = factory.CreateClient();

        using var response = await client.GetAsync(url, Cancellation);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    private static async Task<StudyStatsResponse> StatsAsync(HttpClient client) =>
        (await client.GetFromJsonAsync<StudyStatsResponse>("/api/study/stats", Cancellation))!;

    /// <summary>Answers of one study day, an hour apart, so they say nothing of the pace.</summary>
    private Task<int> AddReviewsAsync(Guid userId, DateOnly day, int known, int unknown, Guid? cardId = null) =>
        factory.QueryAsync(db =>
        {
            var at = new DateTimeOffset(day.ToDateTime(new TimeOnly(6, 0)), TimeSpan.Zero);
            db.CardReviews.AddRange(Enumerable.Range(0, known + unknown).Select(i => new CardReview
            {
                Id = Guid.CreateVersion7(),
                UserId = userId,
                CardId = cardId,
                StudyDay = day,
                Knew = i < known,
                FromBox = 1,
                ToBox = 1,
                ReviewedAt = at.AddHours(i),
            }));
            return db.SaveChangesAsync(Cancellation);
        });

    private Task<int> AddReviewsAtAsync(Guid userId, IReadOnlyList<DateTimeOffset> times) =>
        factory.QueryAsync(db =>
        {
            db.CardReviews.AddRange(times.Select(at => new CardReview
            {
                Id = Guid.CreateVersion7(),
                UserId = userId,
                StudyDay = factory.Today(),
                Knew = true,
                FromBox = 1,
                ToBox = 2,
                ReviewedAt = at,
            }));
            return db.SaveChangesAsync(Cancellation);
        });
}
