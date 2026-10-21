# Specifications

1. Input validation. A goal is rejected with an error message if its name
   is empty, its cost is not greater than 0, its year is outside the range
   from the current year to 59 years ahead, or its month has already passed
   this year. Non-numeric characters in money fields are ignored, and an
   empty or invalid number is treated as 0.

2. Wealth model. Starting wealth is the user's net worth, and yearly savings
   are the monthly investment times 12. Each simulated year, savings are
   added and wealth grows by W(t+1) = W(t) * exp[(mu - sigma^2/2) + sigma*Z],
   where Z ~ N(0,1). All amounts are in today's dollars, using after-inflation
   returns. The portfolio is one of five risk levels, from Cautious
   (mu = 0.015, sigma = 0.05) to Aggressive (mu = 0.057, sigma = 0.19).

3. Probability. The probability of a goal is the fraction of 4,000 simulated
   paths in which the goal is paid in full by its target date. It is always
   between 0 and 1. Random numbers use a fixed seed, so the same inputs
   always give the same probability.

4. Verdict. The probability maps to a verdict: at least 0.8 is "Comfortably
   within reach", at least 0.6 is "A realistic goal", at least 0.4 is
   "A stretch", at least 0.2 is "A long shot as planned", and below 0.2 is
   "Unlikely on this plan". A goal counts as realistic when its probability
   is at least 0.6.
