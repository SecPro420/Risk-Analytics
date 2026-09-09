import ssl

# Bypass local SSL certificate check on macOS
ssl._create_default_https_context = ssl._create_unverified_context

#matplotlib for plotting, pandas for data manipulation, and seaborn for statistical data visualization
import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sb

#importing the dataset from my GitHub
github_url = "https://raw.githubusercontent.com/SecPro420/Risk-Analytics/refs/heads/main/Risk%20Analytics%20-%20Class%201%20-%20Dataset.xlsx"

df = pd.read_excel(github_url, header =1)


sb.set_theme(style="whitegrid")
plt.figure(figsize=(10,6))
sb.scatterplot(
    data=df,
    x="Media Coverage (Articles)",
    y="Public Perception (Scale 1-10)",
    hue="Disaster Type",
    s=90,
    alpha=0.8
)

plt.title(
    "Media Coverage vs Public Perception",
    fontsize=14,
    fontweight="bold",
)
plt.xlabel("Media Coverage (Number of Articles)", fontsize=12)
plt.ylabel("Public Perception (Scale 1-10)", fontsize=12)
plt.legend(bbox_to_anchor=(1.05, 1), loc="upper left", title="Disaster Type")

plt.tight_layout()
plt.show()
