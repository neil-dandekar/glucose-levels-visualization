
const margin = [130, 100, 100, 150];
let width = window.innerWidth,
    height = window.innerHeight;

let svg, tooltip, simulation, circles;
let currentDay = 1;
let globalData = [];

// Hard-coded quartiles for BMI
const BMI_QUARTILES = [27, 30, 35];
const diabetesCategories = [
    "Non-Diabetic",
    "Pre-Diabetic",
    "Type 2 Diabetic",
];

// Discrete color mapping for gut health => 1,2,3
const gutColors = {
    1: "#a8c8ea", // light blue
    2: "#4f93d2", // medium
    3: "#084594", // dark
};

// We'll keep a reference for yScale to debug
let yScale;

function initChart(data) {
    d3.select("svg").remove();

    width = window.innerWidth;
    height = window.innerHeight;

    svg = d3
        .select("body")
        .append("svg")
        .attr("width", width)
        .attr("height", height);

    // Tooltip
    tooltip = d3
        .select("body")
        .append("div")
        .style("position", "absolute")
        .style("visibility", "hidden")
        .style("background", "#fff")
        .style("padding", "8px")
        .style("border", "1px solid #000")
        .style("border-radius", "5px")
        .style("box-shadow", "2px 2px 10px rgba(0,0,0,0.5)")
        .style("pointer-events", "none");

    // Title
    svg.append("text")
        .attr("x", width / 2)
        .attr("y", margin[0] / 2)
        .attr("text-anchor", "middle")
        .style("font-size", "28px")
        .style("font-weight", "bold")
        // .text("D3 Swarm - Day Slider (Discrete GH)");
        .text(
            "Unraveling Glucose Patterns: A 10-Day Look at Diabetes & Health"
        );

    const annotation = [
        "This plot compares the average glucose levels of patients categorized as by diabetic status, with bubble size representing BMI and color indicating gut health status over 10 days.",
        "Biggest Takeaway: Type 2 diabetics show much higher variability in average glucose levels. Non-diabetic and pre-diabetic groups have more stable glucose levels.",
    ];
    // Subtitle
    svg.append("text")
        .attr("x", width / 2)
        .attr("y", margin[0] / 2 + 30)
        .attr("text-anchor", "middle")
        .style("font-size", "15px")
        .selectAll("tspan")
        .data(annotation)
        .enter()
        .append("tspan")
        .attr("x", width / 2) // Keep x position the same
        .attr("dy", (d, i) => i * 20) // ✅ Move each line down
        .text((d) => d);

    // Gather all day columns
    let allDays = [];
    for (let i = 1; i <= 10; i++) {
        const col = "day" + i;
        data.forEach((d) => allDays.push(d[col]));
    }
    let maxDayVal = d3.max(allDays) || 100;
    if (maxDayVal < 0) maxDayVal = 100;

    // x-scale
    let xScale = d3
        .scaleBand()
        .domain(diabetesCategories)
        .range([margin[3], width - margin[1]])
        .padding(0.5);

    // y-scale
    yScale = d3
        .scaleLinear()
        .domain([0, maxDayVal])
        .range([height - margin[2], margin[0]]);

    // size scale for BMI
    let bmiExtent = d3.extent(data, (d) => d.bmi);
    let sizeScale = d3
        .scaleLinear()
        .domain(bmiExtent)
        .range([3, 20])
        .clamp(true);

    // Axes
    svg.append("g")
        .attr("transform", `translate(0, ${height - margin[2]})`)
        .call(d3.axisBottom(xScale))
        .selectAll("text")
        .style("text-anchor", "middle")
        .style("font-size", "16px");

    svg.append("g")
        .attr("transform", `translate(${margin[3]},0)`)
        .call(d3.axisLeft(yScale))
        .selectAll("text")
        .style("font-size", "16px");

    // trying to get labels to show up
    // x axis label
    svg.append("text")
        .attr("x", width / 2)
        .attr("y", height - margin[2] + 50)
        .attr("text-anchor", "middle")
        .style("font-size", "18px")
        .text("Diabetes Status");
    // y axis label
    svg.append("text")
        .attr("x", -height / 2)
        .attr("y", margin[3] - 70)
        .attr("text-anchor", "middle")
        .attr("transform", "rotate(-90)")
        .style("font-size", "18px")
        .text("Avgerage Glucose Level (mg/dL)");

    // Single force sim with moderate y strength for smoother transitions
    simulation = d3
        .forceSimulation(data)
        .force(
            "x",
            d3
                .forceX((d) => {
                    if (
                        !diabetesCategories.includes(
                            d.diabetes_status
                        )
                    ) {
                        return width / 2;
                    }
                    return (
                        xScale(d.diabetes_status) +
                        xScale.bandwidth() / 2
                    );
                })
                .strength(0.2)
        )
        // day columns => y
        .force(
            "y",
            d3
                .forceY((d) => {
                    return yScale(d["day" + currentDay] || 0);
                })
                .strength(0.4)
        ) // more gentle than 2
        .force(
            "collide",
            d3.forceCollide((d) => {
                return d.bmi > 0 ? sizeScale(d.bmi) : 3;
            })
        )
        .alphaDecay(0)
        .alpha(0.3)
        .on("tick", ticked);

    circles = svg
        .selectAll(".circ")
        .data(data)
        .enter()
        .append("circle")
        .attr("stroke", "black")
        // color => discrete gut(1,2,3)
        .attr("fill", (d) => {
            let gh = d.gut_microbiome_health;
            return gutColors[gh] || "#999";
        })
        .attr("r", (d) => (d.bmi > 0 ? sizeScale(d.bmi) : 3))
        .style("opacity", 0.7)
        .on("mouseover", function (d) {
            tooltip.style("visibility", "visible");
            d3.select(this)
                .transition()
                .duration(200)
                .style("opacity", 1);
        })
        .on("mousemove", function (d) {
            let healthStatus =
                healthLabels[d.gut_microbiome_health] || "Unknown";
            let e = d3.event;
            tooltip.html(`
<b>ID:</b> ${d.participant_id}<br/>
Gender: ${d.gender} <br/>
Age: ${d.age}<br/>
Gut: ${healthStatus} <br/>
BMI: ${d.bmi.toFixed(2)}<br/>
Avg. Glucose Level: ${d["day" + currentDay].toFixed(2)}<br/>
            `);
            let tipW = tooltip.node().offsetWidth;
            let tipH = tooltip.node().offsetHeight;
            tooltip
                .style("left", e.pageX + "px")
                .style("top", e.pageY - tipH + "px");
        })
        .on("mouseout", function (d) {
            tooltip.style("visibility", "hidden");
            d3.select(this)
                .transition()
                .duration(200)
                .style("opacity", 0.7);
        });

    // alpha decay after 3s
    setTimeout(() => simulation.alphaDecay(0.1), 3000);

    // ========== Combined Legend Box ========== //
    let legendBox = svg
        .append("g")
        .attr(
            "transform",
            `translate(${width - 270}, ${margin[0] + 50})`
        );

    // Adjusted Box Size for More Space
    legendBox
        .append("rect")
        .attr("width", 240) // Slightly wider to prevent text overflow
        .attr("height", 450) // Increased height for better spacing
        .attr("fill", "white")
        .attr("stroke", "black")
        .attr("rx", 10)
        .attr("ry", 10)
        .attr("opacity", 0.8);

    // Title: "Key"
    legendBox
        .append("text")
        .attr("x", 120) // Centered inside the box
        .attr("y", 30)
        .attr("text-anchor", "middle")
        .style("font-size", "16px")
        .style("font-weight", "bold")
        .text("Key");
    // underline for the "Key"
    legendBox
        .append("line")
        .attr("x1", 105)
        .attr("x2", 135)
        .attr("y1", 35)
        .attr("y2", 35)
        .attr("stroke", "black")
        .attr("stroke-width", 1);

    // ========== BMI Legend (More Space) ========== //
    let BMIlegend = legendBox
        .append("g")
        .attr("transform", `translate(10, 80)`); // Slightly shifted

    BMIlegend.append("text")
        .attr("x", 0)
        .attr("y", -10)
        .style("font-size", "14px")
        .style("font-weight", "bold")
        .text("BMI Sizes");

    // ========== Gut Health Legend (More Space) ========== //
    let GHlegend = legendBox
        .append("g")
        .attr("transform", `translate(10, 350)`); // Shifted down further

    GHlegend.append("text")
        .attr("x", 0)
        .attr("y", -10)
        .style("font-size", "14px")
        .style("font-weight", "bold")
        .text("Gut Health");

    const healthLabels = {
        1: "Healthy",
        2: "Moderate",
        3: "Unhealthy",
    };
    [1, 2, 3].forEach((v, i) => {
        let gg = GHlegend.append("g").attr(
            "transform",
            `translate(0, ${i * 35 + 10})`
        ); // More spacing

        gg.append("rect")
            .attr("x", 0)
            .attr("y", -10)
            .attr("width", 20)
            .attr("height", 20)
            .attr("fill", gutColors[v] || "#999")
            .style("opacity", 0.7)
            .attr("stroke", "black");

        gg.append("text")
            .attr("x", 30)
            .attr("y", 5)
            .style("font-size", "14px")
            .text(healthLabels[v]);
    });

    // use quartiles 27,30,35
    const BMI_VALUES = [20, 25, 30, 35, 40, 50]; // Expanded range for better scaling
    BMI_VALUES.forEach((b, i) => {
        let g = BMIlegend.append("g").attr(
            "transform",
            `translate(20, ${i * 38})`
        ); // Adjust spacing

        g.append("circle")
            .attr("cx", 30) // Slightly right for better alignment
            .attr("cy", 0)
            .attr("r", sizeScale(b)) // Use size scale to adjust circle size
            .attr("fill", "gray")
            .attr("stroke", "black")
            .style("opacity", 0.7);

        g.append("text")
            .attr("x", 70) // Position text to the right
            .attr("y", 5)
            .style("font-size", "14px")
            .text(`BMI: ${b}`);
    });
}

function ticked() {
    circles.attr("cx", (d) => d.x).attr("cy", (d) => d.y);
}

function updateDay(day) {
    currentDay = day;
    if (!simulation) return;

    console.log(`Update to day${day}`);
    globalData.forEach((d) => {
        console.log(d.participant_id, " => ", d["day" + day]);
    });

    // reassign y force with gentler strength
    simulation.force(
        "y",
        d3
            .forceY((d) => {
                let val = d["day" + day] || 0;
                return yScale(val);
            })
            .strength(0.4) // gentler
    );
    // moderate re-energize
    simulation.alpha(0.5).restart();
}

// animation
let animationInterval = null;
let isAnimating = false; // Flag to track animation state

function animateSlider() {
    let slider = document.getElementById("daySlider");
    let maxDay = 10;

    if (isAnimating) {
        // If currently animating, pause the animation
        clearInterval(animationInterval);
        animationInterval = null;
        isAnimating = false;
    } else {
        // If currently paused, resume the animation
        isAnimating = true;

        animationInterval = setInterval(() => {
            if (currentDay > maxDay) {
                // clearInterval(animationInterval); // Stop at maxDay
                // animationInterval = null; // Clear reference
                // isAnimating = false;
                // return;
                currentDay = 1; // Reset to 1
            }

            console.log(`Animating Day: ${currentDay}`); // Debug log
            slider.value = currentDay; // Move the slider
            document.getElementById("dayValue").textContent =
                currentDay;
            updateDay(currentDay); // Update visualization

            currentDay++;
        }, 600); // 1 second per step
    }
}

document.addEventListener("DOMContentLoaded", () => {
    document
        .getElementById("animateButton")
        .addEventListener("click", animateSlider);
});

d3.csv("data.csv").then((data) => {
    data.forEach((d) => {
        for (let i = 1; i <= 10; i++) {
            let col = "day" + i;
            d[col] = +d[col] || 0; // parse numeric
        }
        d.bmi = +d.bmi || 0;
        // discrete GH = 1,2,3
        d.gut_microbiome_health = +d.gut_microbiome_health || 1;
    });
    globalData = data;
    initChart(data);
});

// slider
const daySlider = document.getElementById("daySlider");
const dayValue = document.getElementById("dayValue");
daySlider.addEventListener("input", function () {
    let newDay = +this.value;
    dayValue.textContent = newDay;
    updateDay(newDay);
});

// On resize, re-init
window.addEventListener("resize", () => {
    if (!globalData.length) return;
    initChart(globalData);
    updateDay(currentDay);
});