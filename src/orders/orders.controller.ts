import { Controller, ParseUUIDPipe } from '@nestjs/common'
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices'
import { OrdersService } from './orders.service'
import { ChangeOrderStatusDto, CreateOrderDto, OrderPaginationDto } from './dto'
import { OrderWithProducts } from './interfaces/order-with-products.interface'
import { PaidOrderDto } from './dto/paid-order.dto'

@Controller()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) { }

  @MessagePattern('create_order')
  async create(@Payload() createOrderDto: CreateOrderDto) {
    const order: OrderWithProducts = await this.ordersService.create(createOrderDto)
    const paymentSession = await this.ordersService.createPaymentSession(order)

    return {
      order,
      paymentSession
    }
  }

  @MessagePattern('find_all_orders')
  findAll(@Payload() paginationDto: OrderPaginationDto) {
    return this.ordersService.findAll(paginationDto)
  }

  @MessagePattern('find_one_order')
  findOne(@Payload('id', ParseUUIDPipe) id: string) {
    return this.ordersService.findOne(id)
  }

  @MessagePattern('change_order_status')
  changeOrderStatus(@Payload() changeOrderStatusDto: ChangeOrderStatusDto) {
    console.log(changeOrderStatusDto)
    return this.ordersService.changeOrderStatus(changeOrderStatusDto)
  }

  @EventPattern('payment.succeeded')
  paidOrder(@Payload() paidOrderDto: PaidOrderDto) {
    return this.ordersService.paidOrder(paidOrderDto)
  }
}
