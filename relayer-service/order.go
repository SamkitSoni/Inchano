package main

type OrderState string

const (
	Pending   OrderState = "Pending"
	Processed OrderState = "Processed"
	Shipped   OrderState = "Shipped"
	Delivered OrderState = "Delivered"
	Canceled  OrderState = "Canceled"
)

type Order struct {
	ID       string
	State    OrderState
	Customer string
	Items    []OrderItem
}

type OrderItem struct {
	ProductID string
	Quantity  int
	Price     float64
}

func (o *Order) CanTransitionToState(newState OrderState) bool {
	switch o.State {
	case Pending:
		return newState == Processed || newState == Canceled
	case Processed:
		return newState == Shipped
	case Shipped:
		return newState == Delivered
	default:
		return false
	}
}
