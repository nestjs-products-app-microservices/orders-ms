import { HttpStatus, Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { CreateOrderDto } from './dto/create-order.dto'
import { ClientProxy, RpcException } from '@nestjs/microservices'
import { OrderPaginationDto } from './dto/order-pagination.dto'
import { ChangeOrderStatusDto } from './dto'
import { catchError, firstValueFrom } from 'rxjs'
import { NATS_SERVICE } from 'src/config/service'

@Injectable()
export class OrdersService extends PrismaClient implements OnModuleInit {
  constructor(
    @Inject(NATS_SERVICE) private readonly client: ClientProxy
  ) {
    super()
  }


  private readonly logger = new Logger(OrdersService.name)

  onModuleInit() {
    this.$connect()
    this.logger.log('Connected to the database')
  }

  async create(createOrderDto: CreateOrderDto) {
    const { items } = createOrderDto

    const productIds = items.map(item => item.productId)

    const products: any[] = await firstValueFrom(
      this.client.send({ cmd: 'validate_products' }, productIds)
        .pipe(
          catchError(err => { throw new RpcException(err) })
        )
    )

    const totalAmount = createOrderDto.items.reduce((acc, orderItem) =>  {
      const price = products.find(product => product.id === orderItem.productId).price
      return acc + orderItem.quantity * price
    }, 0)

    const totalItems = createOrderDto.items.reduce((acc, orderItem) => acc + orderItem.quantity, 0)

    const order = await this.order.create({
      data: {
        totalAmount,
        totalItems,
        items: {
          createMany: {
            data: createOrderDto.items.map(orderItem => ({
              price: products.find(product => product.id === orderItem.productId).price,
              productId: orderItem.productId,
              quantity: orderItem.quantity
            }))
          }
        }
      },
      include: {
        items: {
          select: {
            price: true,
            quantity: true,
            productId: true
          }
        }
      }
    })

    return {
      ...order,
      items: order.items.map(item => ({
        ...item,
        name: products.find(product => product.id === item.productId).name
      }))
    }
  }

  async findAll(paginationDto: OrderPaginationDto) {
    const { page, limit, status } = paginationDto

    const totalPages = await this.order.count({ where: { status } })
    const lastPage = Math.ceil(totalPages / limit)

    return {
      data: await this.order.findMany({
        where: { status },
        skip: (page - 1) * limit,
        take: limit,
      }),
      meta: {
        page,
        total: totalPages,
        lastPage,
      },
    }
  }

  async findOne(id: string) {
    const order = await this.order.findUnique({
      where: { id },
      include: {
        items: true
      }
    })

    if (!order) {
      throw new RpcException({
        status: HttpStatus.NOT_FOUND,
        message: 'Order not found'
      })
    }

    const productIds = order.items.map(item => item.productId)

    const products = await firstValueFrom(
      this.client.send({ cmd: 'validate_products' }, productIds)
        .pipe(
          catchError(err => { throw new RpcException(err) })
        )
    )

    return {
      ...order,
      items: order.items.map(item => ({
        ...item,
        name: products.find(product => product.id === item.productId).name
      }))
    }
  }

  async changeOrderStatus(changeOrderStatusDto: ChangeOrderStatusDto) {
    const { id, status } = changeOrderStatusDto

    const order = await this.findOne(id)

    if (order.status === status) {
      return order
    }

    return this.order.update({
      where: { id },
      data: { status }
    })
  }
}
