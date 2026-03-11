from collections import defaultdict
from crime_categories import CRIME_CATEGORY_MAP, CRIME_WEIGHTS

def lga_aggregate(events):
    stats = defaultdict(lambda: {
        "violent": 0,
        "motor": 0,
        "property": 0,
        "total_crimes": 0
    })

    for event in events:

        suburb = event.get("suburb")
        offence_type = event.get("offence_type")

        lga = get_lga_from_suburb(suburb)

        category = map_offence_category(offence_type)

        lga_stats[lga][category] += 1
        
        # what is offence count?
        lga_stats[lga]["total_crimes"] += 1

    return lga_stats

def sentiment_scores(events):
    # gives average? idk if we're going to do smtg else 
    # but i'll stick with average for now
    sent_sum = {}
    sent_count = {}

    for event in events:

        if "sentiment" not in event:
            continue

        suburb = event.get("suburb")
        lga = get_lga_from_suburb(suburb)
        sent_sum[lga] = sent_sum.get(lga, 0) + event["sentiment"]
        sent_count[lga] = sent_count.get(lga, 0) + 1

    sent_scores = {}

    for lga in sent_sum:
        sent_scores[lga] = sent_sum[lga] / sent_count[lga]

    return sent_scores

def stat_score(lga_stats, pop_data, exponent=100000):
    stat_scores = {}

    for lga, stats in lga_stats.items():

        pop = pop_data.get(lga)

        if not pop or pop == 0:
            continue

        weighted_sum = (
            stats["violent"] * CRIME_WEIGHTS["violent"] +
            stats["motor"] * CRIME_WEIGHTS["motor"] +
            stats["property"] * CRIME_WEIGHTS["property"]
        )

        score = (weighted_sum / pop) * exponent

        stat_scores[lga] = score

    return stat_scores