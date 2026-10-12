// widgets/__fixtures__/live-chip-specs.ts: real card specs the concierge model
// wrote for landing chips (live chip audit, 2026-10-12), kept verbatim so widget
// tests pin how the widgets render what a model actually sends, not a tidy
// hand-written example. Do not clean them up: the mess is the point.
export const healthSummary = {
	"ui": {
		"type": "flex",
		"props": {
			"direction": "column",
			"gap": 12
		},
		"children": [
			{
				"type": "callout",
				"props": {
					"variant": "info",
					"title": "Sample data, not medical advice",
					"text": "These figures are invented for this demo. Talk to a clinician about your own health."
				}
			},
			{
				"type": "card",
				"props": {
					"title": "Week health summary",
					"verdict": {
						"text": "Steps and sleep rose this week, and resting heart rate eased to 58 bpm on Saturday.",
						"status": "good"
					}
				},
				"children": [
					{
						"type": "grid",
						"props": {
							"columns": "repeat(auto-fit, minmax(150px, 1fr))",
							"gap": 12
						},
						"children": [
							{
								"type": "stat",
								"props": {
									"label": "Avg steps per day",
									"value": "{state.days.sum('steps') / state.days.length}",
									"format": "number",
									"delta": 540,
									"direction": "up-good"
								}
							},
							{
								"type": "stat",
								"props": {
									"label": "Avg sleep (hours)",
									"value": "{state.days.sum('sleep') / state.days.length}",
									"format": "number",
									"delta": 0.3,
									"direction": "up-good"
								}
							},
							{
								"type": "stat",
								"props": {
									"label": "Avg resting HR (bpm)",
									"value": "{state.days.sum('hr') / state.days.length}",
									"format": "number",
									"delta": -1.4,
									"direction": "down-good"
								}
							}
						]
					}
				]
			},
			{
				"type": "card",
				"props": {
					"title": "Steps by day"
				},
				"children": [
					{
						"type": "chart",
						"props": {
							"type": "bar",
							"height": 240,
							"data": [
								{
									"label": "Mon",
									"value": 8200
								},
								{
									"label": "Tue",
									"value": 9450
								},
								{
									"label": "Wed",
									"value": 7100
								},
								{
									"label": "Thu",
									"value": 10300
								},
								{
									"label": "Fri",
									"value": 6800
								},
								{
									"label": "Sat",
									"value": 12050
								},
								{
									"label": "Sun",
									"value": 8900
								}
							]
						}
					}
				]
			},
			{
				"type": "card",
				"props": {
					"title": "Daily detail"
				},
				"children": [
					{
						"type": "table",
						"props": {
							"columns": [
								{
									"header": "Day",
									"accessorKey": "day"
								},
								{
									"header": "Steps",
									"accessorKey": "steps"
								},
								{
									"header": "Sleep (h)",
									"accessorKey": "sleep"
								},
								{
									"header": "Resting HR",
									"accessorKey": "hr"
								}
							],
							"rows": [
								{
									"day": "Mon",
									"steps": 8200,
									"sleep": 7.2,
									"hr": 62
								},
								{
									"day": "Tue",
									"steps": 9450,
									"sleep": 6.8,
									"hr": 64
								},
								{
									"day": "Wed",
									"steps": 7100,
									"sleep": 7.5,
									"hr": 61
								},
								{
									"day": "Thu",
									"steps": 10300,
									"sleep": 7.0,
									"hr": 60
								},
								{
									"day": "Fri",
									"steps": 6800,
									"sleep": 6.5,
									"hr": 66
								},
								{
									"day": "Sat",
									"steps": 12050,
									"sleep": 8.1,
									"hr": 58
								},
								{
									"day": "Sun",
									"steps": 8900,
									"sleep": 7.6,
									"hr": 60
								}
							]
						}
					}
				]
			}
		]
	},
	"state": {
		"days": [
			{
				"day": "Mon",
				"steps": 8200,
				"sleep": 7.2,
				"hr": 62
			},
			{
				"day": "Tue",
				"steps": 9450,
				"sleep": 6.8,
				"hr": 64
			},
			{
				"day": "Wed",
				"steps": 7100,
				"sleep": 7.5,
				"hr": 61
			},
			{
				"day": "Thu",
				"steps": 10300,
				"sleep": 7.0,
				"hr": 60
			},
			{
				"day": "Fri",
				"steps": 6800,
				"sleep": 6.5,
				"hr": 66
			},
			{
				"day": "Sat",
				"steps": 12050,
				"sleep": 8.1,
				"hr": 58
			},
			{
				"day": "Sun",
				"steps": 8900,
				"sleep": 7.6,
				"hr": 60
			}
		]
	}
}
;

export const createInvoice = {
	"ui": {
		"type": "invoice-layout",
		"props": {
			"docType": "Invoice",
			"from": {
				"name": "Your Design Studio",
				"address": "123 Sample St, Springfield"
			},
			"billTo": {
				"name": "Sample Client Co."
			},
			"invoiceNumber": "INV-1001",
			"issueDate": "2026-10-12",
			"dueDate": "2026-11-11",
			"status": "Unpaid",
			"currency": "USD",
			"lines": [
				{
					"description": "Design work (3 hours at $85/hr)",
					"quantity": 3,
					"unitPrice": 85
				},
				{
					"description": "Logo package",
					"quantity": 1,
					"unitPrice": 450
				}
			],
			"summary": [
				{
					"label": "Tax (8%)",
					"amount": 56.4
				}
			],
			"subtotal": 705,
			"total": 761.4,
			"paymentTerms": "Net 30",
			"notes": "Sample data for illustration only."
		}
	},
	"state": {}
}
;

export const reviewNda = {
	"ui": {
		"type": "card",
		"props": {
			"title": "NDA clauses to read closely",
			"description": "Sample data, not your document"
		},
		"children": [
			{
				"type": "table",
				"props": {
					"columns": [
						{
							"header": "Clause",
							"accessorKey": "clause"
						},
						{
							"header": "Why read it",
							"accessorKey": "why"
						},
						{
							"header": "Priority",
							"accessorKey": "priority"
						}
					],
					"rows": [
						{
							"clause": "Definition of Confidential Information",
							"why": "Check whether it covers only marked or clearly sensitive material, or everything shared.",
							"priority": "High"
						},
						{
							"clause": "Exclusions",
							"why": "Public, already known, or independently developed information should be carved out.",
							"priority": "High"
						},
						{
							"clause": "Permitted purpose",
							"why": "Use should be limited to the stated purpose, not any business use.",
							"priority": "High"
						},
						{
							"clause": "Residuals clause",
							"why": "Lets recipients reuse information retained in memory. Often a red flag.",
							"priority": "High"
						},
						{
							"clause": "Term and survival",
							"why": "How long the duties last after the deal ends. Trade secrets may need longer.",
							"priority": "Medium"
						},
						{
							"clause": "Compelled disclosure",
							"why": "Notice duty if a court or regulator requires disclosure.",
							"priority": "Medium"
						},
						{
							"clause": "Return or destruction",
							"why": "What must happen to files at the end, and whether backups are covered.",
							"priority": "Medium"
						},
						{
							"clause": "Governing law and venue",
							"why": "Which state or country's law applies, and where disputes are heard.",
							"priority": "Medium"
						},
						{
							"clause": "Remedies",
							"why": "Whether the other side can seek an injunction quickly.",
							"priority": "Low"
						},
						{
							"clause": "Non-solicitation",
							"why": "Any hiring restrictions hidden in the NDA.",
							"priority": "Low"
						}
					]
				}
			},
			{
				"type": "callout",
				"props": {
					"variant": "warning",
					"title": "Not legal advice",
					"text": "This is general information, not legal advice. Have a qualified lawyer review any NDA before you sign it."
				}
			}
		]
	},
	"state": {}
}
;

export const watchSavingsGrow = {
	"ui": {
		"type": "card",
		"props": {
			"title": "Savings growth",
			"description": "Starting from $0. Change the deposit, rate and years."
		},
		"children": [
			{
				"type": "grid",
				"props": {
					"columns": "repeat(auto-fit, minmax(260px, 1fr))",
					"gap": 12
				},
				"children": [
					{
						"type": "number-input",
						"props": {
							"label": "Monthly deposit ($)",
							"min": 0,
							"max": 5000,
							"step": 25
						},
						"bind": "{state.deposit}"
					},
					{
						"type": "slider",
						"props": {
							"label": "Interest rate (% per year)",
							"min": 0,
							"max": 12,
							"step": 0.5,
							"showValue": true
						},
						"bind": "{state.rate}"
					}
				]
			},
			{
				"type": "slider",
				"props": {
					"label": "Years",
					"min": 1,
					"max": 40,
					"step": 1,
					"showValue": true
				},
				"bind": "{state.years}"
			},
			{
				"type": "growth-projection",
				"props": {
					"initial": 0,
					"deposit": "{state.deposit}",
					"rate": "{state.rate}",
					"years": "{state.years}",
					"compounding": "monthly"
				}
			}
		]
	},
	"state": {
		"deposit": 300,
		"rate": 5,
		"years": 10
	}
}
;

